import { createHash } from "node:crypto";
import { facilitator } from "@payai/facilitator";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { getAddress, isAddressEqual, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  assertAuthorization,
  assertBaseMainnet,
  createBaseClient,
  findFinalizedAuthorizationTransaction,
  readUsdcBalance,
  verifySettlementReceipt,
  waitForFinalizedReceipt,
  type Authorization,
  type BaseChainClient,
} from "./chain.js";
import { loadSmokeConfig, type SmokeConfig } from "./config.js";
import { FACILITATOR_URL, NETWORK, USDC_ADDRESS } from "./constants.js";
import { createAttemptGuard, readAttempt, updateAttempt, type AttemptRecord } from "./guard.js";
import { validatePaymentRequired } from "./requirements.js";
import { loadBuyerAccount } from "./signer.js";

export interface CapturedResponse {
  status: number;
  receivedAt: string;
  bodyBase64: string;
  bodySha256: string;
  paymentRequired: string | null;
  paymentRequiredSha256: string | null;
  paymentResponse: string | null;
  paymentResponseSha256: string | null;
}

function hash(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function captureResponse(response: Response): Promise<CapturedResponse> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const paymentRequired = response.headers.get("payment-required");
  const paymentResponse = response.headers.get("payment-response");
  return {
    status: response.status,
    receivedAt: new Date().toISOString(),
    bodyBase64: Buffer.from(bytes).toString("base64"),
    bodySha256: hash(bytes),
    paymentRequired,
    paymentRequiredSha256: paymentRequired === null ? null : hash(paymentRequired),
    paymentResponse,
    paymentResponseSha256: paymentResponse === null ? null : hash(paymentResponse),
  };
}

function capturedBody(captured: CapturedResponse): unknown {
  const text = Buffer.from(captured.bodyBase64, "base64").toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface ProtocolClient {
  createPaymentPayload(required: Parameters<x402HTTPClient["createPaymentPayload"]>[0]): Promise<PaymentPayload>;
  encodePaymentSignatureHeader(payment: PaymentPayload): Record<string, string>;
  getPaymentSettleResponse(getHeader: (name: string) => string | null | undefined): SettleResponse;
}

export interface ReadyPayment {
  account: PrivateKeyAccount;
  protocolClient: ProtocolClient;
  required: Parameters<x402HTTPClient["createPaymentPayload"]>[0];
  requirement: Parameters<typeof validatePaymentRequired>[0]["accepts"][number];
  amount: bigint;
  buyerBalance: bigint;
  merchantBalance: bigint;
  startBlock: bigint;
  chainClient: BaseChainClient;
  unpaid: CapturedResponse;
}

export interface BuyerDependencies {
  preflight?: (config: SmokeConfig) => Promise<ReadyPayment>;
  fetch?: typeof fetch;
  waitForFinalizedReceipt?: typeof waitForFinalizedReceipt;
  findFinalizedAuthorizationTransaction?: typeof findFinalizedAuthorizationTransaction;
  readUsdcBalance?: typeof readUsdcBalance;
  verifySettlementReceipt?: typeof verifySettlementReceipt;
}

export const RECONCILIATION_WINDOW_BLOCKS = 600n;

async function preflight(config: SmokeConfig): Promise<ReadyPayment> {
  if (facilitator.url !== FACILITATOR_URL) {
    throw new Error("@payai/facilitator URL does not match integration.json");
  }
  const merchant = getAddress(config.merchantAddress);
  const account = await loadBuyerAccount(config.buyerKeyFile);
  if (isAddressEqual(account.address, merchant)) throw new Error("Buyer and merchant must be distinct disposable addresses");
  const chainClient = createBaseClient(config.baseRpcUrl);
  await assertBaseMainnet(chainClient);
  const facilitatorClient = new HTTPFacilitatorClient(facilitator);
  const supported = await facilitatorClient.getSupported();
  if (!supported.kinds.some(kind => kind.x402Version === 2 && kind.scheme === "exact" && kind.network === NETWORK)) {
    throw new Error(`Facilitator /supported does not advertise exact ${NETWORK}`);
  }

  const protocolClient = new x402HTTPClient(
    new x402Client().register(
      NETWORK,
      new ExactEvmScheme(account, { rpcUrl: config.baseRpcUrl }),
    ),
  );
  const [buyerBalance, merchantBalance] = await Promise.all([
    readUsdcBalance(chainClient, account.address),
    readUsdcBalance(chainClient, merchant),
  ]);
  const startBlock = await chainClient.getBlockNumber();
  const unpaidResponse = await fetch(config.premiumUrl, { redirect: "error" });
  const unpaid = await captureResponse(unpaidResponse);
  if (unpaid.status !== 402) throw new Error(`Expected unpaid 402, got ${unpaid.status}`);
  const required = protocolClient.getPaymentRequiredResponse(
    name => (name.toLowerCase() === "payment-required" ? unpaid.paymentRequired : null),
    capturedBody(unpaid),
  );
  const requirement = validatePaymentRequired(required, merchant, config.maxAmountAtomic);
  const amount = BigInt(requirement.amount);
  if (buyerBalance < amount) throw new Error(`Buyer USDC balance ${buyerBalance} is below ${amount}`);
  return {
    account,
    protocolClient,
    required,
    requirement,
    amount,
    buyerBalance,
    merchantBalance,
    startBlock,
    chainClient,
    unpaid,
  };
}

function evmAuthorization(payment: PaymentPayload): Authorization {
  const payload = payment.payload as { authorization?: Partial<Authorization> };
  const authorization = payload.authorization;
  if (
    !authorization ||
    typeof authorization.from !== "string" ||
    typeof authorization.to !== "string" ||
    typeof authorization.value !== "string" ||
    typeof authorization.validAfter !== "string" ||
    typeof authorization.validBefore !== "string" ||
    typeof authorization.nonce !== "string"
  ) {
    throw new Error("EVM payment payload has no complete EIP-3009 authorization");
  }
  return authorization as Authorization;
}

function settleFromCapture(client: ProtocolClient, paid: CapturedResponse): SettleResponse | null {
  if (paid.paymentResponse === null) return null;
  return client.getPaymentSettleResponse(
    name => (name.toLowerCase() === "payment-response" ? paid.paymentResponse : null),
  );
}

export function settlementDisposition(settlement: SettleResponse | null): "uncertain" | "failed" | "success" {
  if (settlement === null) return "uncertain";
  if (settlement.success === true) return "success";
  if (settlement.success === false) return "failed";
  return "uncertain";
}

function validateSettlement(settlement: SettleResponse, expectedPayer: string): Hex {
  if (settlement.success !== true) {
    throw new Error(`Settlement failed: ${settlement.errorReason ?? settlement.errorMessage ?? "unknown"}`);
  }
  if (settlement.network !== NETWORK) throw new Error(`Settlement returned wrong network ${settlement.network}`);
  if (
    settlement.payer !== undefined &&
    !isAddressEqual(getAddress(settlement.payer), getAddress(expectedPayer))
  ) {
    throw new Error(`Settlement returned wrong payer ${settlement.payer}`);
  }
  if (typeof settlement.transaction !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) {
    throw new Error("Settlement returned an invalid EVM transaction hash");
  }
  return settlement.transaction as Hex;
}

async function finishFinalization(
  config: SmokeConfig,
  record: AttemptRecord,
  transactionHash: Hex,
  resourceDelivered: boolean,
  chainClient: BaseChainClient,
  dependencies: BuyerDependencies = {},
): Promise<AttemptRecord> {
  record = await updateAttempt(config.guardFile, record, { state: "finalizing", transactionHash });
  try {
    const receipt = await (dependencies.waitForFinalizedReceipt ?? waitForFinalizedReceipt)(
      chainClient,
      transactionHash,
    );
    const authorization = record.authorization as Authorization;
    (dependencies.verifySettlementReceipt ?? verifySettlementReceipt)(receipt, authorization);
    const readBalance = dependencies.readUsdcBalance ?? readUsdcBalance;
    let balanceReport: Record<string, unknown>;
    try {
      const [buyerBalance, merchantBalance] = await Promise.all([
        readBalance(chainClient, record.binding.payer, receipt.blockNumber),
        readBalance(chainClient, record.binding.merchant, receipt.blockNumber),
      ]);
      balanceReport = {
        status: "available",
        blockNumber: receipt.blockNumber.toString(),
        buyerAmountAtomic: buyerBalance.toString(),
        merchantAmountAtomic: merchantBalance.toString(),
      };
    } catch (error) {
      balanceReport = {
        status: "unavailable",
        blockNumber: receipt.blockNumber.toString(),
        reason: error instanceof Error ? error.message : String(error),
        note: "No latest-state fallback was used for this historical block report.",
      };
    }
    return updateAttempt(config.guardFile, record, {
      state: "finalized",
      resourceDelivered,
      finalizedAt: new Date().toISOString(),
      chain: {
        transactionHash,
        blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash,
        transactionIndex: receipt.transactionIndex,
        status: receipt.status,
        exactTransfer: {
          asset: USDC_ADDRESS,
          from: authorization.from,
          to: authorization.to,
          amountAtomic: authorization.value,
          authorizationNonce: authorization.nonce,
        },
      },
      balanceReport,
    });
  } catch (error) {
    await updateAttempt(config.guardFile, record, {
      state: "uncertain",
      transactionHash,
      finalityError: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Settlement reporting is incomplete; keep the guard and run payment:reconcile. Never pay again: ${String(error)}`);
  }
}

export async function runOnce(config: SmokeConfig, dependencies: BuyerDependencies = {}): Promise<AttemptRecord> {
  const ready = await (dependencies.preflight ?? preflight)(config);
  let record = await createAttemptGuard(config.guardFile, {
    url: config.premiumUrl,
    merchant: getAddress(config.merchantAddress),
    payer: ready.account.address,
    amountAtomic: ready.requirement.amount,
  });
  record = await updateAttempt(config.guardFile, record, {
    startBlock: ready.startBlock.toString(),
    reconciliationEndBlock: (ready.startBlock + RECONCILIATION_WINDOW_BLOCKS).toString(),
    preflightBalanceReport: {
      status: "latest state observed before authorization",
      blockNumberNearObservation: ready.startBlock.toString(),
      buyerAmountAtomic: ready.buyerBalance.toString(),
      merchantAmountAtomic: ready.merchantBalance.toString(),
    },
    unpaidResponse: ready.unpaid,
  });

  let payment: PaymentPayload;
  try {
    payment = await ready.protocolClient.createPaymentPayload(ready.required);
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "failed", failure: `signing: ${String(error)}` });
    throw error;
  }
  const authorization = evmAuthorization(payment);
  assertAuthorization(authorization, ready.account.address, config.merchantAddress, ready.amount);
  const headers = ready.protocolClient.encodePaymentSignatureHeader(payment);
  record = await updateAttempt(config.guardFile, record, {
    state: "submitting",
    authorization,
    paymentSignatureHeaderSha256: hash(Object.values(headers).join("")),
    submissionStartedAt: new Date().toISOString(),
  });

  let paidResponse: Response;
  try {
    paidResponse = await (dependencies.fetch ?? fetch)(config.premiumUrl, {
      method: "GET",
      headers,
      redirect: "error",
    });
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "uncertain", uncertainty: `paid request: ${String(error)}` });
    throw new Error(`Paid request outcome is uncertain; run payment:reconcile and do not pay again: ${String(error)}`);
  }
  const paid = await captureResponse(paidResponse).catch(async error => {
    await updateAttempt(config.guardFile, record, { state: "uncertain", uncertainty: `reading paid response: ${String(error)}` });
    throw new Error("Paid response could not be recorded; reconcile before any further action");
  });
  let settlement: SettleResponse | null;
  try {
    settlement = settleFromCapture(ready.protocolClient, paid);
  } catch (error) {
    await updateAttempt(config.guardFile, record, {
      state: "uncertain",
      paidResponse: paid,
      uncertainty: `invalid PAYMENT-RESPONSE: ${String(error)}`,
    });
    throw new Error("Paid request returned an unreadable settlement response; reconcile before any further action");
  }
  const disposition = settlementDisposition(settlement);
  if (disposition === "uncertain") {
    await updateAttempt(config.guardFile, record, {
      state: "uncertain",
      paidResponse: paid,
      settlement,
      uncertainty: "PAYMENT-RESPONSE missing or malformed",
    });
    throw new Error("Paid request has no valid PAYMENT-RESPONSE; reconcile before any further action");
  }
  if (settlement === null) throw new Error("Unreachable missing settlement response");
  if (disposition === "failed") {
    await updateAttempt(config.guardFile, record, { state: "failed", paidResponse: paid, settlement });
    throw new Error(`Settlement failed: ${settlement.errorReason ?? settlement.errorMessage ?? "unknown"}`);
  }
  let transactionHash: Hex;
  try {
    transactionHash = validateSettlement(settlement, ready.account.address);
  } catch (error) {
    await updateAttempt(config.guardFile, record, {
      state: "uncertain",
      paidResponse: paid,
      settlement,
      uncertainty: String(error),
    });
    throw error;
  }
  record = await updateAttempt(config.guardFile, record, { paidResponse: paid, settlement, transactionHash });
  const finalized = await finishFinalization(
    config,
    record,
    transactionHash,
    paid.status === 200,
    ready.chainClient,
    dependencies,
  );
  if (paid.status !== 200) throw new Error(`Settlement finalized but paid resource returned HTTP ${paid.status}`);
  return finalized;
}

function readAuthorization(record: AttemptRecord): Authorization {
  const authorization = record.authorization as Authorization | undefined;
  if (!authorization) throw new Error("Guard lacks EIP-3009 authorization evidence");
  assertAuthorization(
    authorization,
    record.binding.payer,
    record.binding.merchant,
    BigInt(record.binding.amountAtomic),
  );
  return authorization;
}

export async function reconcile(config: SmokeConfig, dependencies: BuyerDependencies = {}): Promise<AttemptRecord> {
  let record = await readAttempt(config.guardFile);
  const account = await loadBuyerAccount(config.buyerKeyFile);
  if (
    record.binding.url !== config.premiumUrl ||
    !isAddressEqual(getAddress(record.binding.merchant), getAddress(config.merchantAddress)) ||
    record.binding.network !== NETWORK ||
    !isAddressEqual(getAddress(record.binding.asset), getAddress(USDC_ADDRESS)) ||
    !isAddressEqual(getAddress(record.binding.payer), account.address)
  ) {
    throw new Error("Current URL, merchant, network, asset, or buyer does not match the persisted payment attempt");
  }
  if (BigInt(record.binding.amountAtomic) > config.maxAmountAtomic) {
    throw new Error("Persisted amount exceeds current MAX_AMOUNT_ATOMIC");
  }
  if (record.state === "finalized") return record;
  const chainClient = createBaseClient(config.baseRpcUrl);
  await assertBaseMainnet(chainClient);
  const authorization = readAuthorization(record);
  let transactionHash =
    typeof record.transactionHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(record.transactionHash)
      ? (record.transactionHash as Hex)
      : null;
  if (!transactionHash) {
    const startBlock = record.startBlock;
    const endBlock = record.reconciliationEndBlock;
    if (
      typeof startBlock !== "string" ||
      !/^[0-9]+$/.test(startBlock) ||
      typeof endBlock !== "string" ||
      !/^[0-9]+$/.test(endBlock)
    ) {
      throw new Error("Guard lacks its bounded reconciliation block range");
    }
    transactionHash = await (
      dependencies.findFinalizedAuthorizationTransaction ?? findFinalizedAuthorizationTransaction
    )(chainClient, BigInt(startBlock), BigInt(endBlock), authorization);
  }
  if (!transactionHash) {
    record = await updateAttempt(config.guardFile, record, {
      state: "uncertain",
      lastReconciliation: {
        at: new Date().toISOString(),
        result: "no matching finalized AuthorizationUsed event in the bounded block range",
      },
    });
    throw new Error("No matching finalized authorization found; keep the guard and investigate. Never pay again.");
  }
  const paid = record.paidResponse as { status?: unknown } | undefined;
  return finishFinalization(
    config,
    record,
    transactionHash,
    paid?.status === 200,
    chainClient,
    dependencies,
  );
}

async function main() {
  const config = loadSmokeConfig();
  if (process.argv.includes("--preflight")) {
    const ready = await preflight(config);
    console.log(
      JSON.stringify(
        {
          ok: true,
          network: NETWORK,
          payer: ready.account.address,
          merchant: getAddress(config.merchantAddress),
          amountAtomic: ready.requirement.amount,
          startBlock: ready.startBlock.toString(),
        },
        null,
        2,
      ),
    );
    return;
  }
  const result = process.argv.includes("--reconcile")
    ? await reconcile(config)
    : await runOnce(config);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
