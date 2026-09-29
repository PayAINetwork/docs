import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { PaymentRequired } from "@x402/core/types";
import { createAttemptGuard, readAttempt, updateAttempt } from "../src/guard.js";
import { GENESIS_HASH, NETWORK, USDC_MINT } from "../src/constants.js";
import { validatePaymentRequired } from "../src/requirements.js";
import { assertSolanaMainnetRpc, reconcileMessageFingerprint, selectFeePayer, waitForFinalization } from "../src/rpc.js";
import { assertDistinctRoles, assertExactBalanceDeltas, captureResponse, runOnce, settlementDisposition, type BuyerDependencies, type CapturedResponse } from "../src/smoke.js";
import type { SmokeConfig } from "../src/config.js";

const MERCHANT = "DwfXQdK9HMXoDFfCxC8DKLTEjVE6ApAC2D3KE5F2KFam";
const PAYER = "9xQeWvG816bUx9EPjHmaT23yvVMQKrWK7f7dYzQLgJm";
const FEE_PAYER = "CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww";

function required(overrides: Partial<PaymentRequired["accepts"][number]> = {}): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: "http://127.0.0.1/premium", description: "test", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: NETWORK,
      asset: USDC_MINT,
      amount: "1000",
      payTo: MERCHANT,
      maxTimeoutSeconds: 60,
      extra: { feePayer: FEE_PAYER },
      ...overrides,
    }],
  };
}

test("requirements accept the exact configured payment", () => {
  assert.equal(validatePaymentRequired(required(), MERCHANT, 1000n, FEE_PAYER).amount, "1000");
});

for (const [name, override] of [
  ["over cap", { amount: "1001" }],
  ["wrong network", { network: "solana:devnet" }],
  ["wrong mint", { asset: "11111111111111111111111111111111" }],
  ["wrong recipient", { payTo: PAYER }],
  ["wrong fee payer", { extra: { feePayer: PAYER } }],
  ["numeric amount", { amount: 1000 as unknown as string }],
  ["invalid timeout", { maxTimeoutSeconds: 1.5 }],
] as const) {
  test(`requirements reject ${name}`, () => {
    assert.throws(() => validatePaymentRequired(required(override), MERCHANT, 1000n, FEE_PAYER), /Refusing to pay/);
  });
}

test("fee payer comes from the matching /supported capability", () => {
  assert.equal(selectFeePayer({
    kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK, extra: { feePayer: FEE_PAYER } }],
    extensions: [], signers: {},
  }), FEE_PAYER);
  assert.throws(() => selectFeePayer({ kinds: [], extensions: [], signers: {} }), /no fee payer/);
});

test("buyer, merchant and sponsored fee payer must be distinct", () => {
  assert.doesNotThrow(() => assertDistinctRoles(PAYER, MERCHANT, FEE_PAYER));
  assert.throws(() => assertDistinctRoles(MERCHANT, MERCHANT, FEE_PAYER), /Buyer and merchant/);
  assert.throws(() => assertDistinctRoles(PAYER, MERCHANT, PAYER), /fee payer/);
});

test("exact integer balance deltas reject either side moving incorrectly", () => {
  assert.doesNotThrow(() => assertExactBalanceDeltas(2000n, 1000n, 0n, 1000n, 1000n));
  assert.throws(() => assertExactBalanceDeltas(2000n, 999n, 0n, 1000n, 1000n), /Buyer USDC delta/);
  assert.throws(() => assertExactBalanceDeltas(2000n, 1000n, 0n, 999n, 1000n), /Merchant USDC delta/);
});

function rpcFetch(result: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
}

test("RPC assertion requires the full Mainnet genesis hash", async () => {
  await assertSolanaMainnetRpc("https://rpc.invalid", rpcFetch(GENESIS_HASH));
  await assert.rejects(
    assertSolanaMainnetRpc("https://rpc.invalid", rpcFetch(NETWORK.split(":")[1])),
    /expected full genesis hash/,
  );
  await assert.rejects(assertSolanaMainnetRpc("https://rpc.invalid", rpcFetch("EtWTRABZaYq6iMfeYKouRu166VU2xqa1")), /not Solana Mainnet/);
});

test("uncertain reconciliation uses finalized address-history params and matches fingerprint", async () => {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const mock = (async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    calls.push({ method: request.method, params: request.params });
    const result = request.method === "getSignaturesForAddress"
      ? [{ signature: "chain-signature", blockTime: Math.floor(Date.now() / 1000), err: null }]
      : { transaction: ["actual-wire-transaction", "base64"] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  }) as typeof fetch;
  const signature = await reconcileMessageFingerprint(
    "https://rpc.invalid", "merchant-ata", "wanted", new Date().toISOString(), mock,
    transaction => transaction === "actual-wire-transaction" ? "wanted" : "other",
  );
  assert.equal(signature, "chain-signature");
  assert.deepEqual(calls[0], {
    method: "getSignaturesForAddress",
    params: ["merchant-ata", { limit: 100, commitment: "finalized" }],
  });
  assert.equal(calls[1]?.method, "getTransaction");
});

test("persistent guard permits one authorization and survives uncertain outcome", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-attempt-"));
  const file = join(directory, "attempt.json");
  let record = await createAttemptGuard(file, {
    url: "http://127.0.0.1/premium", merchant: MERCHANT, payer: PAYER, amountAtomic: "1000",
  });
  record = await updateAttempt(file, record, { state: "uncertain", signedTransactionMessageSha256: "abc" });
  await assert.rejects(createAttemptGuard(file, {
    url: "http://127.0.0.1/premium", merchant: MERCHANT, payer: PAYER, amountAtomic: "1000",
  }), /already exists/);
  const disk = JSON.parse(await readFile(file, "utf8")) as { state: string; binding: { network: string } };
  assert.equal(disk.state, "uncertain");
  assert.equal(disk.binding.network, NETWORK);
});

test("finalization failure is terminal for the current attempt", async () => {
  const failedStatus = rpcFetch({ value: [{ confirmationStatus: "finalized", err: { InstructionError: [0, "Custom"] } }] });
  await assert.rejects(waitForFinalization("https://rpc.invalid", "sig", failedStatus, 1, 0), /transaction failed/i);
});

test("missing settlement response is classified as uncertain evidence", async () => {
  const response = new Response("upstream timeout", { status: 504 });
  const captured = await captureResponse(response);
  assert.equal(captured.paymentResponse, null);
  assert.equal(Buffer.from(captured.bodyBase64, "base64").toString(), "upstream timeout");
  assert.match(captured.bodySha256, /^[0-9a-f]{64}$/);
  assert.equal(settlementDisposition(null), "uncertain");
  assert.equal(settlementDisposition({
    success: false, transaction: "", network: NETWORK, errorReason: "transaction_failed",
  }), "failed");
});

function captured(status = 402): CapturedResponse {
  return {
    status,
    receivedAt: "2026-09-29T00:00:00.000Z",
    bodyBase64: "e30=",
    bodySha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    paymentRequired: "wire-required",
    paymentRequiredSha256: "a".repeat(64),
    paymentResponse: null,
    paymentResponseSha256: null,
  };
}

function injectedBuyer(file: string): { config: SmokeConfig; dependencies: BuyerDependencies } {
  const requirement = required().accepts[0]!;
  const config: SmokeConfig = {
    buyerKeypairFile: "unused-in-injected-test.json",
    guardFile: file,
    maxAmountAtomic: 1000n,
    merchantAddress: MERCHANT,
    premiumUrl: "http://127.0.0.1/premium",
    rpcUrl: "https://rpc.invalid",
  };
  const dependencies: BuyerDependencies = {
    preflight: async () => ({
      signer: { address: PAYER },
      protocolClient: {
        createPaymentPayload: async accepted => ({ x402Version: 2, accepted: accepted.accepts[0]!, payload: { transaction: "test-transaction" } }),
        encodePaymentSignatureHeader: () => ({ "payment-signature": "signed-wire-bytes" }),
        getPaymentSettleResponse: () => ({
          success: true,
          transaction: "1".repeat(88),
          network: NETWORK,
          payer: PAYER,
        }),
      },
      required: required(),
      requirement,
      amount: 1000n,
      feePayer: FEE_PAYER,
      buyer: { ata: "buyer-ata", amountAtomic: 2000n, owner: PAYER },
      merchant: { ata: "merchant-ata", amountAtomic: 0n, owner: MERCHANT },
      unpaid: captured(),
    }),
    fingerprint: () => "authorized-message-fingerprint",
  };
  return { config, dependencies };
}

test("runOnce persists uncertainty and restart cannot authorize again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-run-once-"));
  const { config, dependencies } = injectedBuyer(join(directory, "attempt.json"));
  dependencies.fetch = (async () => { throw new Error("connection reset after submission"); }) as typeof fetch;
  await assert.rejects(runOnce(config, dependencies), /outcome is uncertain/);
  assert.equal((await readAttempt(config.guardFile)).state, "uncertain");
  await assert.rejects(runOnce(config, dependencies), /already exists/);
});

test("runOnce persists successful HTTP delivery and finalized exact deltas", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-run-success-"));
  const { config, dependencies } = injectedBuyer(join(directory, "attempt.json"));
  dependencies.fetch = (async () => new Response("premium bytes", {
    status: 200,
    headers: { "payment-response": "wire-settlement-response" },
  })) as typeof fetch;
  dependencies.waitForFinalization = async () => ({
    slot: 123,
    blockTime: 1_799_000_000,
    fee: 10_001,
    messageFingerprint: "authorized-message-fingerprint",
    tokenBalances: [
      { owner: PAYER, mint: USDC_MINT, pre: 2000n, post: 1000n },
      { owner: MERCHANT, mint: USDC_MINT, pre: 0n, post: 1000n },
    ],
    transactionRpcEvidence: {
      receivedAt: "2026-09-29T00:00:02.000Z",
      bodyBase64: "eyJyZXN1bHQiOnt9fQ==",
      bodySha256: "b".repeat(64),
    },
  });
  dependencies.readUsdcAta = async () => ({ ata: "buyer-ata", amountAtomic: 1000n, owner: PAYER });
  dependencies.requireMerchantAta = async () => ({ ata: "merchant-ata", amountAtomic: 1000n, owner: MERCHANT });
  const record = await runOnce(config, dependencies);
  assert.equal(record.state, "finalized");
  assert.equal(record.resourceDelivered, true);
  assert.equal((record.chain as { messageSha256: string }).messageSha256, "authorized-message-fingerprint");
});

test("runOnce treats a malformed PAYMENT-RESPONSE as uncertain", async () => {
  const directory = await mkdtemp(join(tmpdir(), "payai-run-malformed-"));
  const { config, dependencies } = injectedBuyer(join(directory, "attempt.json"));
  const original = dependencies.preflight!;
  dependencies.preflight = async smokeConfig => {
    const ready = await original(smokeConfig);
    ready.protocolClient.getPaymentSettleResponse = () => ({} as never);
    return ready;
  };
  dependencies.fetch = (async () => new Response("ambiguous", {
    status: 200,
    headers: { "payment-response": "e30=" },
  })) as typeof fetch;
  await assert.rejects(runOnce(config, dependencies), /no valid PAYMENT-RESPONSE/);
  assert.equal((await readAttempt(config.guardFile)).state, "uncertain");
});
