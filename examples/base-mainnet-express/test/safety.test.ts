import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertAuthorization,
  findFinalizedAuthorizationTransaction,
  verifySettlementReceipt,
  waitForFinalizedReceipt,
  type Authorization,
  type BaseChainClient,
} from "../src/chain.js";
import type { SmokeConfig } from "../src/config.js";
import { NETWORK, USDC_ADDRESS, USDC_NAME, USDC_VERSION } from "../src/constants.js";
import { createAttemptGuard, readAttempt, updateAttempt } from "../src/guard.js";
import { validatePaymentRequired } from "../src/requirements.js";
import {
  captureResponse,
  runOnce,
  settlementDisposition,
  type BuyerDependencies,
  type CapturedResponse,
  type ReadyPayment,
} from "../src/smoke.js";

const MERCHANT = "0x1111111111111111111111111111111111111111";
const PRIVATE_KEY = `0x${"1".padStart(64, "0")}` as `0x${string}`;
const ACCOUNT = privateKeyToAccount(PRIVATE_KEY);
const TX_HASH = `0x${"a".repeat(64)}` as `0x${string}`;
const NONCE = `0x${"b".repeat(64)}` as `0x${string}`;

function required(overrides: Partial<PaymentRequirements> = {}): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: "http://127.0.0.1/premium", description: "test", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: NETWORK,
      asset: USDC_ADDRESS,
      amount: "10000",
      payTo: MERCHANT,
      maxTimeoutSeconds: 60,
      extra: { name: USDC_NAME, version: USDC_VERSION },
      ...overrides,
    }],
  };
}

test("requirements accept exact Base USDC and reject changed payment fields", () => {
  assert.equal(validatePaymentRequired(required(), MERCHANT, 10000n).amount, "10000");
  for (const override of [
    { amount: "10001" },
    { network: "eip155:84532" },
    { asset: "0x3333333333333333333333333333333333333333" },
    { payTo: "0x4444444444444444444444444444444444444444" },
    { extra: { name: "Fake USDC", version: "2" } },
    { extra: { name: USDC_NAME, version: USDC_VERSION, assetTransferMethod: "permit2" } },
  ] as Partial<PaymentRequirements>[]) {
    assert.throws(() => validatePaymentRequired(required(override), MERCHANT, 10000n), /Refusing to pay/);
  }
});

test("signed authorization binds payer, recipient, amount, and nonce", () => {
  const authorization: Authorization = {
    from: ACCOUNT.address,
    to: MERCHANT,
    value: "10000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: NONCE,
  };
  assert.doesNotThrow(() => assertAuthorization(authorization, ACCOUNT.address, MERCHANT, 10000n));
  assert.throws(() => assertAuthorization({ ...authorization, to: ACCOUNT.address }, ACCOUNT.address, MERCHANT, 10000n), /recipient/);
  assert.throws(() => assertAuthorization({ ...authorization, value: "9999" }, ACCOUNT.address, MERCHANT, 10000n), /amount/);
});

function receiptFor(authorization: Authorization, amount = 10000n): TransactionReceipt {
  const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  const used = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)");
  const common = {
    address: USDC_ADDRESS,
    blockHash: `0x${"d".repeat(64)}` as `0x${string}`,
    blockNumber: 456n,
    logIndex: 0,
    removed: false,
    transactionHash: TX_HASH,
    transactionIndex: 0,
  };
  return {
    blockHash: common.blockHash,
    blockNumber: common.blockNumber,
    contractAddress: null,
    cumulativeGasUsed: 1n,
    effectiveGasPrice: 1n,
    from: ACCOUNT.address,
    gasUsed: 1n,
    logs: [
      {
        ...common,
        data: encodeAbiParameters([{ type: "uint256" }], [amount]),
        topics: encodeEventTopics({
          abi: [transfer],
          eventName: "Transfer",
          args: { from: authorization.from, to: authorization.to },
        }) as TransactionReceipt["logs"][number]["topics"],
      },
      {
        ...common,
        logIndex: 1,
        data: "0x",
        topics: encodeEventTopics({
          abi: [used],
          eventName: "AuthorizationUsed",
          args: { authorizer: authorization.from, nonce: authorization.nonce },
        }) as TransactionReceipt["logs"][number]["topics"],
      },
    ],
    logsBloom: `0x${"0".repeat(512)}`,
    status: "success",
    to: MERCHANT,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    type: "eip1559",
  };
}

test("finalized receipt must contain the exact USDC transfer and authorization nonce", () => {
  const authorization: Authorization = {
    from: ACCOUNT.address,
    to: MERCHANT,
    value: "10000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: NONCE,
  };
  assert.doesNotThrow(() => verifySettlementReceipt(receiptFor(authorization), authorization));
  assert.throws(
    () => verifySettlementReceipt(receiptFor(authorization, 9999n), authorization),
    /exact USDC Transfer matches/,
  );
});

test("finality re-fetches the receipt and proves its block hash is canonical", async () => {
  const authorization: Authorization = {
    from: ACCOUNT.address,
    to: MERCHANT,
    value: "10000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: NONCE,
  };
  const receipt = receiptFor(authorization);
  const orphaned = { ...receipt, blockHash: `0x${"e".repeat(64)}` as `0x${string}` };
  let receiptReads = 0;
  const client = {
    waitForTransactionReceipt: async () => orphaned,
    getTransactionReceipt: async () => {
      receiptReads += 1;
      return receipt;
    },
    getBlock: async (args: { blockTag?: string; blockNumber?: bigint }) =>
      args.blockTag === "finalized"
        ? { number: receipt.blockNumber }
        : { number: args.blockNumber ?? null, hash: receipt.blockHash },
  } as unknown as BaseChainClient;
  assert.equal(await waitForFinalizedReceipt(client, TX_HASH, 1, 0), receipt);
  assert.equal(receiptReads, 1);

  client.getBlock = async args =>
    "blockTag" in args
      ? { number: receipt.blockNumber }
      : { number: args.blockNumber, hash: `0x${"f".repeat(64)}` as `0x${string}` };
  await assert.rejects(
    waitForFinalizedReceipt(client, TX_HASH, 1, 0),
    /not in the canonical finalized block/,
  );
});

test("reconciliation never queries before finality or beyond its recorded window", async () => {
  const authorization: Authorization = {
    from: ACCOUNT.address,
    to: MERCHANT,
    value: "10000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: NONCE,
  };
  let query: Record<string, unknown> | null = null;
  const client = {
    getBlock: async () => ({ number: 99n }),
    getLogs: async (args: Record<string, unknown>) => {
      query = args;
      return [];
    },
  } as unknown as BaseChainClient;
  assert.equal(await findFinalizedAuthorizationTransaction(client, 100n, 700n, authorization), null);
  assert.equal(query, null);
  client.getBlock = async () => ({ number: 900n });
  assert.equal(await findFinalizedAuthorizationTransaction(client, 100n, 700n, authorization), null);
  const recordedQuery = query as Record<string, unknown> | null;
  assert.ok(recordedQuery);
  assert.equal(recordedQuery.fromBlock, 100n);
  assert.equal(recordedQuery.toBlock, 700n);
});

test("persistent guard permits one authorization and survives uncertainty", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-base-attempt-"));
  const file = join(directory, "attempt.json");
  let record = await createAttemptGuard(file, {
    url: "http://127.0.0.1/premium",
    merchant: MERCHANT,
    payer: ACCOUNT.address,
    amountAtomic: "10000",
  });
  record = await updateAttempt(file, record, { state: "uncertain", authorizationNonce: NONCE });
  await assert.rejects(
    createAttemptGuard(file, {
      url: "http://127.0.0.1/premium",
      merchant: MERCHANT,
      payer: ACCOUNT.address,
      amountAtomic: "10000",
    }),
    /already exists/,
  );
  assert.equal((await readAttempt(file)).state, "uncertain");
});

test("missing settlement response is uncertain evidence", async () => {
  const captured = await captureResponse(new Response("upstream timeout", { status: 504 }));
  assert.equal(captured.paymentResponse, null);
  assert.equal(Buffer.from(captured.bodyBase64, "base64").toString(), "upstream timeout");
  assert.equal(settlementDisposition(null), "uncertain");
  assert.equal(settlementDisposition({
    success: false,
    transaction: "",
    network: NETWORK,
    errorReason: "transaction_failed",
  }), "failed");
});

function captured(status = 402): CapturedResponse {
  return {
    status,
    receivedAt: "2026-10-01T00:00:00.000Z",
    bodyBase64: "e30=",
    bodySha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    paymentRequired: "wire-required",
    paymentRequiredSha256: "a".repeat(64),
    paymentResponse: null,
    paymentResponseSha256: null,
  };
}

test("RPC reporting failure preserves the guard and never resubmits payment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-base-once-"));
  const guardFile = join(directory, "attempt.json");
  const requirement = required().accepts[0]!;
  const authorization: Authorization = {
    from: ACCOUNT.address,
    to: MERCHANT,
    value: "10000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: NONCE,
  };
  const chainClient = {} as BaseChainClient;
  const ready: ReadyPayment = {
    account: ACCOUNT,
    protocolClient: {
      createPaymentPayload: async () => ({
        x402Version: 2,
        accepted: requirement,
        payload: { authorization, signature: `0x${"c".repeat(130)}` },
      }),
      encodePaymentSignatureHeader: () => ({ "payment-signature": "wire-payment" }),
      getPaymentSettleResponse: () => ({
        success: true,
        transaction: TX_HASH,
        network: NETWORK,
        payer: ACCOUNT.address,
      }),
    },
    required: required(),
    requirement,
    amount: 10000n,
    buyerBalance: 10000n,
    merchantBalance: 0n,
    startBlock: 123n,
    chainClient,
    unpaid: captured(),
  };
  const config: SmokeConfig = {
    baseRpcUrl: "https://rpc.invalid",
    buyerKeyFile: "unused.key",
    guardFile,
    maxAmountAtomic: 10000n,
    merchantAddress: MERCHANT,
    premiumUrl: "http://127.0.0.1/premium",
  };
  let submissions = 0;
  const dependencies: BuyerDependencies = {
    preflight: async () => ready,
    fetch: (async () => {
      submissions += 1;
      return new Response("premium", {
        status: 200,
        headers: { "payment-response": "wire-settlement" },
      });
    }) as typeof fetch,
    waitForFinalizedReceipt: async () => {
      throw new Error("temporary RPC report failure");
    },
  };
  await assert.rejects(runOnce(config, dependencies), /Never pay again/);
  assert.equal(submissions, 1);
  const disk = await readAttempt(guardFile);
  assert.equal(disk.state, "uncertain");
  assert.equal(disk.transactionHash, TX_HASH);
});

test("unavailable historical balance report never falls back to latest state or resubmits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-base-report-"));
  const guardFile = join(directory, "attempt.json");
  const requirement = required().accepts[0]!;
  const authorization: Authorization = {
    from: ACCOUNT.address,
    to: MERCHANT,
    value: "10000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: NONCE,
  };
  const ready: ReadyPayment = {
    account: ACCOUNT,
    protocolClient: {
      createPaymentPayload: async () => ({
        x402Version: 2,
        accepted: requirement,
        payload: { authorization, signature: `0x${"c".repeat(130)}` },
      }),
      encodePaymentSignatureHeader: () => ({ "payment-signature": "wire-payment" }),
      getPaymentSettleResponse: () => ({
        success: true,
        transaction: TX_HASH,
        network: NETWORK,
        payer: ACCOUNT.address,
      }),
    },
    required: required(),
    requirement,
    amount: 10000n,
    buyerBalance: 10000n,
    merchantBalance: 0n,
    startBlock: 123n,
    chainClient: {} as BaseChainClient,
    unpaid: captured(),
  };
  const config: SmokeConfig = {
    baseRpcUrl: "https://rpc.invalid",
    buyerKeyFile: "unused.key",
    guardFile,
    maxAmountAtomic: 10000n,
    merchantAddress: MERCHANT,
    premiumUrl: "http://127.0.0.1/premium",
  };
  let submissions = 0;
  let historicalReads = 0;
  const result = await runOnce(config, {
    preflight: async () => ready,
    fetch: (async () => {
      submissions += 1;
      return new Response("premium", {
        status: 200,
        headers: { "payment-response": "wire-settlement" },
      });
    }) as typeof fetch,
    waitForFinalizedReceipt: async () => ({
      blockHash: `0x${"d".repeat(64)}`,
      blockNumber: 456n,
      contractAddress: null,
      cumulativeGasUsed: 1n,
      effectiveGasPrice: 1n,
      from: ACCOUNT.address,
      gasUsed: 1n,
      logs: [],
      logsBloom: `0x${"0".repeat(512)}`,
      status: "success",
      to: MERCHANT,
      transactionHash: TX_HASH,
      transactionIndex: 0,
      type: "eip1559",
    }),
    verifySettlementReceipt: () => undefined,
    readUsdcBalance: async (_client, _owner, blockNumber) => {
      historicalReads += 1;
      assert.equal(blockNumber, 456n);
      throw new Error("archive state unavailable");
    },
  });
  assert.equal(submissions, 1);
  assert.equal(historicalReads, 2);
  assert.equal(result.state, "finalized");
  assert.deepEqual(result.balanceReport, {
    status: "unavailable",
    blockNumber: "456",
    reason: "archive state unavailable",
    note: "No latest-state fallback was used for this historical block report.",
  });
});
