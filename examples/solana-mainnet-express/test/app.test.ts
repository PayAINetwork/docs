import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import type { FacilitatorClient } from "@x402/core/server";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { createApp } from "../src/app.js";
import { NETWORK, PRICE_ATOMIC, USDC_MINT } from "../src/constants.js";

const MERCHANT = "DwfXQdK9HMXoDFfCxC8DKLTEjVE6ApAC2D3KE5F2KFam";
const FEE_PAYER = "CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww";
let server: Server;
let baseUrl: string;

const facilitator: FacilitatorClient = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK, extra: { feePayer: FEE_PAYER } }],
    extensions: [],
    signers: { [NETWORK]: [FEE_PAYER] },
  }),
  verify: async payload => ({
    isValid: (payload.payload as { transaction?: unknown }).transaction !== "forged",
    invalidReason: "invalid_transaction",
    payer: "buyer",
  }),
  settle: async payload => {
    const transaction = (payload.payload as { transaction?: unknown }).transaction;
    if (transaction === "settle-fails") {
      return { success: false, errorReason: "transaction_failed", transaction: "", network: NETWORK, payer: "buyer" };
    }
    return { success: true, transaction: "stub-signature", network: NETWORK, payer: "buyer" };
  },
};

before(async () => {
  server = createApp(MERCHANT, facilitator).listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const listening = server.address();
  if (!listening || typeof listening === "string") throw new Error("Test server has no port");
  baseUrl = `http://127.0.0.1:${listening.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function requirement(): Promise<PaymentRequirements> {
  const response = await fetch(`${baseUrl}/premium`);
  assert.equal(response.status, 402);
  const header = response.headers.get("payment-required");
  assert.ok(header);
  return decodePaymentRequiredHeader(header).accepts[0]!;
}

function paymentHeader(accepted: PaymentRequirements, transaction: string) {
  const payload: PaymentPayload = { x402Version: 2, accepted, payload: { transaction } };
  return { "payment-signature": encodePaymentSignatureHeader(payload) };
}

test("health is free and unpaid premium returns the canonical Mainnet requirement", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  const accepted = await requirement();
  assert.equal(accepted.network, NETWORK);
  assert.equal(accepted.asset, USDC_MINT);
  assert.equal(accepted.amount, PRICE_ATOMIC);
  assert.equal(accepted.payTo, MERCHANT);
  assert.equal(accepted.extra.feePayer, FEE_PAYER);
});

test("verified and settled payment returns premium bytes and PAYMENT-RESPONSE", async () => {
  const accepted = await requirement();
  const response = await fetch(`${baseUrl}/premium`, { headers: paymentHeader(accepted, "signed") });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { content: "premium content" });
  const receipt = response.headers.get("payment-response");
  assert.ok(receipt);
  assert.deepEqual(decodePaymentResponseHeader(receipt), {
    success: true,
    transaction: "stub-signature",
    network: NETWORK,
    payer: "buyer",
  });
});

test("malformed/forged payment never unlocks premium", async () => {
  const malformed = await fetch(`${baseUrl}/premium`, { headers: { "payment-signature": "not-base64-json" } });
  assert.equal(malformed.status, 402);
  const accepted = await requirement();
  const forged = await fetch(`${baseUrl}/premium`, { headers: paymentHeader(accepted, "forged") });
  assert.equal(forged.status, 402);
});

test("unsuccessful settlement never returns premium content", async () => {
  const accepted = await requirement();
  const response = await fetch(`${baseUrl}/premium`, { headers: paymentHeader(accepted, "settle-fails") });
  assert.notEqual(response.status, 200);
  const receipt = response.headers.get("payment-response");
  assert.ok(receipt);
  assert.equal(decodePaymentResponseHeader(receipt).success, false);
});

test("explicit public HTTPS resource survives TLS termination without trusting forwarded headers", async () => {
  const publicUrl = "https://merchant.example/premium";
  const app = createApp(MERCHANT, facilitator, publicUrl);
  assert.equal(app.get("trust proxy"), false);
  const proxied = app.listen(0);
  await new Promise<void>(resolve => proxied.once("listening", resolve));
  try {
    const listening = proxied.address();
    if (!listening || typeof listening === "string") throw new Error("No test port");
    const response = await fetch(`http://127.0.0.1:${listening.port}/premium`, {
      headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" },
    });
    assert.equal(response.status, 402);
    assert.equal(decodePaymentRequiredHeader(response.headers.get("payment-required")!).resource.url, publicUrl);
  } finally {
    await new Promise<void>((resolve, reject) => proxied.close(error => error ? reject(error) : resolve()));
  }
});

test("public resource rejects unsafe or wrong-route URLs", () => {
  for (const url of ["http://merchant.example/premium", "https://user:pass@merchant.example/premium", "https://merchant.example/other", "https://merchant.example/premium?key=secret", "https://merchant.example/premium#fragment", "not-a-url"]) {
    assert.throws(() => createApp(MERCHANT, facilitator, url));
  }
});
