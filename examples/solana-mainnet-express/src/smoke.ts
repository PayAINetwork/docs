import { createHash } from "node:crypto";
import { facilitator } from "@payai/facilitator";
import { address } from "@solana/kit";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadSmokeConfig, type SmokeConfig } from "./config.js";
import { FACILITATOR_URL, NETWORK, USDC_MINT } from "./constants.js";
import { createAttemptGuard, readAttempt, updateAttempt, type AttemptRecord } from "./guard.js";
import { validatePaymentRequired } from "./requirements.js";
import {
  assertSolanaMainnetRpc,
  readUsdcAta,
  reconcileMessageFingerprint,
  requireMerchantAta,
  selectFeePayer,
  transactionMessageFingerprint,
  waitForFinalization,
  type Fetch,
  type FinalizedTransactionEvidence,
  type TokenBalance,
} from "./rpc.js";
import { loadBuyerSigner } from "./signer.js";

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
  try { return JSON.parse(text); } catch { return text; }
}

function tokenEvidence(balance: TokenBalance) {
  return { ata: balance.ata, owner: balance.owner, amountAtomic: balance.amountAtomic.toString() };
}

function readAtomic(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new Error(`Guard has invalid ${label}`);
  return BigInt(value);
}

export function assertExactBalanceDeltas(
  beforeBuyer: bigint,
  afterBuyer: bigint,
  beforeMerchant: bigint,
  afterMerchant: bigint,
  amount: bigint,
): void {
  if (beforeBuyer - afterBuyer !== amount) {
    throw new Error(`Buyer USDC delta was ${beforeBuyer - afterBuyer}, expected ${amount}`);
  }
  if (afterMerchant - beforeMerchant !== amount) {
    throw new Error(`Merchant USDC delta was ${afterMerchant - beforeMerchant}, expected ${amount}`);
  }
}

export function assertDistinctRoles(buyer: string, merchant: string, feePayer: string): void {
  if (buyer === merchant) throw new Error("Buyer and merchant must be distinct disposable addresses");
  if (feePayer === buyer || feePayer === merchant) {
    throw new Error("Facilitator fee payer must be distinct from buyer and merchant");
  }
}

interface ProtocolClient {
  createPaymentPayload(required: Parameters<x402HTTPClient["createPaymentPayload"]>[0]): Promise<PaymentPayload>;
  encodePaymentSignatureHeader(payment: PaymentPayload): Record<string, string>;
  getPaymentSettleResponse(getHeader: (name: string) => string | null | undefined): SettleResponse;
}

export interface ReadyPayment {
  signer: { address: string };
  protocolClient: ProtocolClient;
  required: Parameters<x402HTTPClient["createPaymentPayload"]>[0];
  requirement: Parameters<typeof validatePaymentRequired>[0]["accepts"][number];
  amount: bigint;
  feePayer: string;
  merchant: TokenBalance;
  buyer: TokenBalance;
  unpaid: CapturedResponse;
}

export interface BuyerDependencies {
  preflight?: (config: SmokeConfig) => Promise<ReadyPayment>;
  fetch?: Fetch;
  fingerprint?: (base64Transaction: string) => string;
  waitForFinalization?: (rpcUrl: string, signature: string) => Promise<FinalizedTransactionEvidence>;
  readUsdcAta?: (rpcUrl: string, owner: string) => Promise<TokenBalance | null>;
  requireMerchantAta?: (rpcUrl: string, merchant: string) => Promise<TokenBalance>;
}

async function preflight(config: SmokeConfig): Promise<ReadyPayment> {
  if (facilitator.url !== FACILITATOR_URL) throw new Error("@payai/facilitator URL does not match integration.json");
  address(config.merchantAddress);
  await assertSolanaMainnetRpc(config.rpcUrl);
  const signer = await loadBuyerSigner(config.buyerKeypairFile);
  const facilitatorClient = new HTTPFacilitatorClient(facilitator);
  const supported = await facilitatorClient.getSupported();
  const feePayer = selectFeePayer(supported);
  assertDistinctRoles(signer.address, config.merchantAddress, feePayer);
  const merchant = await requireMerchantAta(config.rpcUrl, config.merchantAddress);
  const buyer = await readUsdcAta(config.rpcUrl, signer.address);
  if (!buyer) throw new Error(`Buyer ${signer.address} has no USDC associated token account`);

  const protocolClient = new x402HTTPClient(
    new x402Client().register(NETWORK, new ExactSvmScheme(signer, { rpcUrl: config.rpcUrl })),
  );
  const unpaidResponse = await fetch(config.premiumUrl, { redirect: "error" });
  const unpaid = await captureResponse(unpaidResponse);
  if (unpaid.status !== 402) throw new Error(`Expected unpaid 402, got ${unpaid.status}`);
  const required = protocolClient.getPaymentRequiredResponse(
    name => name.toLowerCase() === "payment-required" ? unpaid.paymentRequired : null,
    capturedBody(unpaid),
  );
  const requirement = validatePaymentRequired(required, config.merchantAddress, config.maxAmountAtomic, feePayer);
  const amount = BigInt(requirement.amount);
  if (buyer.amountAtomic < amount) throw new Error(`Buyer USDC balance ${buyer.amountAtomic} is below ${amount}`);
  return { signer, protocolClient, required, requirement, amount, feePayer, merchant, buyer, unpaid };
}

function svmTransaction(payment: PaymentPayload): string {
  const transaction = payment.payload.transaction;
  if (typeof transaction !== "string" || transaction.length === 0) throw new Error("SVM payment payload has no transaction");
  return transaction;
}

function settleFromCapture(client: ProtocolClient, paid: CapturedResponse): SettleResponse | null {
  if (paid.paymentResponse === null) return null;
  return client.getPaymentSettleResponse(
    name => name.toLowerCase() === "payment-response" ? paid.paymentResponse : null,
  );
}

export function settlementDisposition(settlement: SettleResponse | null): "uncertain" | "failed" | "success" {
  if (settlement === null) return "uncertain";
  if (settlement.success === true) return "success";
  if (settlement.success === false) return "failed";
  return "uncertain";
}

function validateSettlement(settlement: SettleResponse, expectedPayer: string): void {
  if (settlement.success !== true) {
    throw new Error(`Settlement failed: ${settlement.errorReason ?? settlement.errorMessage ?? "unknown"}`);
  }
  if (settlement.network !== NETWORK) throw new Error(`Settlement returned wrong network ${settlement.network}`);
  if (settlement.payer !== undefined && settlement.payer !== expectedPayer) {
    throw new Error(`Settlement returned wrong payer ${settlement.payer}`);
  }
  if (typeof settlement.transaction !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(settlement.transaction)) {
    throw new Error("Settlement returned an invalid Solana transaction signature");
  }
}

async function finishFinalization(
  config: SmokeConfig,
  record: AttemptRecord,
  signature: string,
  resourceDelivered: boolean,
  dependencies: BuyerDependencies = {},
): Promise<AttemptRecord> {
  record = await updateAttempt(config.guardFile, record, { state: "finalizing", transactionSignature: signature });
  const chain = await (dependencies.waitForFinalization ?? waitForFinalization)(config.rpcUrl, signature);
  if (chain.messageFingerprint !== record.signedTransactionMessageSha256) {
    throw new Error("Finalized transaction does not match the authorized signed message");
  }
  const buyerAddress = record.binding.payer;
  const afterBuyer = await (dependencies.readUsdcAta ?? readUsdcAta)(config.rpcUrl, buyerAddress);
  const afterMerchant = await (dependencies.requireMerchantAta ?? requireMerchantAta)(config.rpcUrl, record.binding.merchant);
  if (!afterBuyer) throw new Error("Buyer USDC ATA disappeared after settlement");
  const before = record.before as { buyer: { amountAtomic: string }; merchant: { amountAtomic: string } };
  const amount = readAtomic(record.binding.amountAtomic, "amount");
  assertExactBalanceDeltas(
    readAtomic(before.buyer.amountAtomic, "buyer before balance"),
    afterBuyer.amountAtomic,
    readAtomic(before.merchant.amountAtomic, "merchant before balance"),
    afterMerchant.amountAtomic,
    amount,
  );
  const buyerTx = chain.tokenBalances.find(balance => balance.mint === USDC_MINT && balance.owner === buyerAddress);
  const merchantTx = chain.tokenBalances.find(balance => balance.mint === USDC_MINT && balance.owner === record.binding.merchant);
  if (!buyerTx || buyerTx.pre - buyerTx.post !== amount) throw new Error("Transaction metadata has the wrong buyer USDC delta");
  if (!merchantTx || merchantTx.post - merchantTx.pre !== amount) throw new Error("Transaction metadata has the wrong merchant USDC delta");
  return updateAttempt(config.guardFile, record, {
    state: "finalized",
    resourceDelivered,
    finalizedAt: new Date().toISOString(),
    chain: {
      signature,
      confirmationStatus: "finalized",
      slot: chain.slot,
      blockTime: new Date(chain.blockTime * 1000).toISOString(),
      networkFeeLamports: chain.fee,
      messageSha256: chain.messageFingerprint,
      tokenDeltas: {
        buyerAtomic: (buyerTx.post - buyerTx.pre).toString(),
        merchantAtomic: (merchantTx.post - merchantTx.pre).toString(),
      },
      getTransactionResponse: chain.transactionRpcEvidence,
    },
    after: { buyer: tokenEvidence(afterBuyer), merchant: tokenEvidence(afterMerchant) },
  });
}

export async function runOnce(config: SmokeConfig, dependencies: BuyerDependencies = {}): Promise<AttemptRecord> {
  const ready = await (dependencies.preflight ?? preflight)(config);
  let record = await createAttemptGuard(config.guardFile, {
    url: config.premiumUrl,
    merchant: config.merchantAddress,
    payer: ready.signer.address,
    amountAtomic: ready.requirement.amount,
  });
  record = await updateAttempt(config.guardFile, record, {
    feePayer: ready.feePayer,
    before: { buyer: tokenEvidence(ready.buyer), merchant: tokenEvidence(ready.merchant) },
    unpaidResponse: ready.unpaid,
  });

  let payment: PaymentPayload;
  try {
    payment = await ready.protocolClient.createPaymentPayload(ready.required);
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "failed", failure: `signing: ${String(error)}` });
    throw error;
  }
  const signedTransaction = svmTransaction(payment);
  const fingerprint = (dependencies.fingerprint ?? transactionMessageFingerprint)(signedTransaction);
  record = await updateAttempt(config.guardFile, record, {
    state: "submitting",
    signedTransactionMessageSha256: fingerprint,
    paymentSignatureHeaderSha256: hash(Object.values(ready.protocolClient.encodePaymentSignatureHeader(payment)).join("")),
    submissionStartedAt: new Date().toISOString(),
  });

  let paidResponse: Response;
  try {
    paidResponse = await (dependencies.fetch ?? fetch)(config.premiumUrl, {
      method: "GET",
      headers: ready.protocolClient.encodePaymentSignatureHeader(payment),
      redirect: "error",
    });
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "uncertain", uncertainty: `paid request: ${String(error)}` });
    throw new Error(`Paid request outcome is uncertain; run payment:reconcile and do not pay again: ${String(error)}`);
  }
  let paid: CapturedResponse;
  try {
    paid = await captureResponse(paidResponse);
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "uncertain", uncertainty: `reading paid response: ${String(error)}` });
    throw new Error("Paid response could not be recorded; reconcile before any further action");
  }
  let settlement: SettleResponse | null;
  try {
    settlement = settleFromCapture(ready.protocolClient, paid);
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "uncertain", paidResponse: paid, uncertainty: `invalid PAYMENT-RESPONSE: ${String(error)}` });
    throw new Error("Paid request returned an unreadable settlement response; reconcile before any further action");
  }
  const disposition = settlementDisposition(settlement);
  if (disposition === "uncertain") {
    await updateAttempt(config.guardFile, record, { state: "uncertain", paidResponse: paid, settlement, uncertainty: "PAYMENT-RESPONSE missing or malformed" });
    throw new Error("Paid request has no valid PAYMENT-RESPONSE; reconcile before any further action");
  }
  if (settlement === null) throw new Error("Unreachable missing settlement response");
  if (disposition === "failed") {
    await updateAttempt(config.guardFile, record, { state: "failed", paidResponse: paid, settlement });
    throw new Error(`Settlement failed: ${settlement.errorReason ?? settlement.errorMessage ?? "unknown"}`);
  }
  try {
    validateSettlement(settlement, ready.signer.address);
  } catch (error) {
    await updateAttempt(config.guardFile, record, { state: "uncertain", paidResponse: paid, settlement, uncertainty: String(error) });
    throw error;
  }
  record = await updateAttempt(config.guardFile, record, { paidResponse: paid, settlement });
  const finalized = await finishFinalization(config, record, settlement.transaction, paid.status === 200, dependencies);
  if (paid.status !== 200) throw new Error(`Settlement finalized but paid resource returned HTTP ${paid.status}`);
  return finalized;
}

export async function reconcile(config: SmokeConfig): Promise<AttemptRecord> {
  let record = await readAttempt(config.guardFile);
  if (record.binding.url !== config.premiumUrl || record.binding.merchant !== config.merchantAddress) {
    throw new Error("Current URL or merchant does not match the persisted payment attempt");
  }
  if (record.binding.network !== NETWORK || record.binding.asset !== USDC_MINT || record.binding.payer !== (await loadBuyerSigner(config.buyerKeypairFile)).address) {
    throw new Error("Current network, asset, or buyer does not match the persisted payment attempt");
  }
  if (readAtomic(record.binding.amountAtomic, "amount") > config.maxAmountAtomic) throw new Error("Persisted amount exceeds current MAX_AMOUNT_ATOMIC");
  if (record.state === "finalized") return record;
  await assertSolanaMainnetRpc(config.rpcUrl);
  let signature = typeof record.transactionSignature === "string" ? record.transactionSignature : null;
  if (!signature) {
    const fingerprint = record.signedTransactionMessageSha256;
    const merchantAta = (record.before as { merchant?: { ata?: unknown } })?.merchant?.ata;
    if (typeof fingerprint !== "string" || typeof merchantAta !== "string") throw new Error("Guard lacks transaction fingerprint evidence");
    signature = await reconcileMessageFingerprint(config.rpcUrl, merchantAta, fingerprint, record.startedAt);
  }
  if (!signature) {
    record = await updateAttempt(config.guardFile, record, {
      state: "uncertain",
      lastReconciliation: { at: new Date().toISOString(), result: "no matching finalized transaction found" },
    });
    throw new Error("No matching finalized transaction found; keep the guard and reconcile again or investigate manually. Never pay again.");
  }
  const paid = record.paidResponse as { status?: unknown } | undefined;
  return finishFinalization(config, record, signature, paid?.status === 200);
}

async function main() {
  const config = loadSmokeConfig();
  if (process.argv.includes("--preflight")) {
    const ready = await preflight(config);
    console.log(JSON.stringify({
      ok: true,
      network: NETWORK,
      payer: ready.signer.address,
      merchant: config.merchantAddress,
      amountAtomic: ready.requirement.amount,
      feePayer: ready.feePayer,
      merchantAta: ready.merchant.ata,
    }, null, 2));
    return;
  }
  const result = process.argv.includes("--reconcile") ? await reconcile(config) : await runOnce(config);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
