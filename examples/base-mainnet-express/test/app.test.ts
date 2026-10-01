import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { createApp } from "../src/app.js";
import {
  NETWORK,
  PRICE_ATOMIC,
  USDC_ADDRESS,
  USDC_NAME,
  USDC_VERSION,
} from "../src/constants.js";

const MERCHANT = "0x1111111111111111111111111111111111111111";
const PAYER = "0x2222222222222222222222222222222222222222";
const TX_HASH = `0x${"a".repeat(64)}`;
let server: Server;
let baseUrl: string;

const facilitator: FacilitatorClient = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
    extensions: [],
    signers: {},
  }),
  verify: async payload => ({
    isValid: (payload.payload as { signature?: unknown }).signature !== "forged",
    invalidReason: "invalid_signature",
    payer: PAYER,
  }),
  settle: async payload => {
    if ((payload.payload as { signature?: unknown }).signature === "settle-fails") {
      return { success: false, errorReason: "transaction_failed", transaction: "", network: NETWORK, payer: PAYER };
    }
    return { success: true, transaction: TX_HASH, network: NETWORK, payer: PAYER };
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
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

async function requirement(): Promise<PaymentRequirements> {
  const response = await fetch(`${baseUrl}/premium`);
  assert.equal(response.status, 402);
  const header = response.headers.get("payment-required");
  assert.ok(header);
  return decodePaymentRequiredHeader(header).accepts[0]!;
}

function paymentHeader(accepted: PaymentRequirements, signature: string) {
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted,
    payload: {
      authorization: {
        from: PAYER,
        to: MERCHANT,
        value: PRICE_ATOMIC,
        validAfter: "0",
        validBefore: "9999999999",
        nonce: `0x${"b".repeat(64)}`,
      },
      signature,
    },
  };
  return { "payment-signature": encodePaymentSignatureHeader(payload) };
}

test("health is free and unpaid premium returns the exact Base Mainnet requirement", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  const accepted = await requirement();
  assert.equal(accepted.network, NETWORK);
  assert.equal(accepted.asset, USDC_ADDRESS);
  assert.equal(accepted.amount, PRICE_ATOMIC);
  assert.equal(accepted.payTo, MERCHANT);
  assert.equal(accepted.extra.name, USDC_NAME);
  assert.equal(accepted.extra.version, USDC_VERSION);
});

test("route variants and unsupported methods never expose the unpaid premium resource", async () => {
  for (const path of ["/Premium", "/premium/", "/%70remium"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, `expected ${path} to be rejected before payment`);
    assert.doesNotMatch(await response.text(), /premium content/);
  }

  const queried = await fetch(`${baseUrl}/premium?x=1`);
  assert.equal(queried.status, 402, "the exact path with a query must remain payment-protected");
  assert.doesNotMatch(await queried.text(), /premium content/);

  const head = await fetch(`${baseUrl}/premium`, { method: "HEAD" });
  assert.equal(head.status, 405, "HEAD must not invoke Express's automatic GET fallback");
  assert.equal(head.headers.get("allow"), "GET");
  assert.equal(await head.text(), "");

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await fetch(`${baseUrl}/premium`, { method });
    assert.equal(response.status, 405, `${method} must be rejected before the paid handler`);
    assert.equal(response.headers.get("allow"), "GET");
    assert.doesNotMatch(await response.text(), /premium content/, `${method} exposed the resource`);
  }
});

test("verified and settled payment returns premium bytes and PAYMENT-RESPONSE", async () => {
  const accepted = await requirement();
  const response = await fetch(`${baseUrl}/premium`, {
    headers: paymentHeader(accepted, `0x${"c".repeat(130)}`),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { content: "premium content" });
  const receipt = response.headers.get("payment-response");
  assert.ok(receipt);
  assert.deepEqual(decodePaymentResponseHeader(receipt), {
    success: true,
    transaction: TX_HASH,
    network: NETWORK,
    payer: PAYER,
  });
});

test("malformed, forged, and failed-settlement payments never unlock premium", async () => {
  const malformed = await fetch(`${baseUrl}/premium`, {
    headers: { "payment-signature": "not-base64-json" },
  });
  assert.equal(malformed.status, 402);
  const accepted = await requirement();
  const forged = await fetch(`${baseUrl}/premium`, {
    headers: paymentHeader(accepted, "forged"),
  });
  assert.equal(forged.status, 402);
  const failed = await fetch(`${baseUrl}/premium`, {
    headers: paymentHeader(accepted, "settle-fails"),
  });
  assert.notEqual(failed.status, 200);
  assert.equal(decodePaymentResponseHeader(failed.headers.get("payment-response")!).success, false);
});

test("explicit public HTTPS resource survives TLS termination without forwarded-header trust", async () => {
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
    await new Promise<void>((resolve, reject) => proxied.close(error => (error ? reject(error) : resolve())));
  }
});
