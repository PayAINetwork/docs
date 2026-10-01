# Base Mainnet Express merchant and guarded buyer

This released-package example protects `GET /premium` with x402 v2 exact USDC on Base Mainnet (`eip155:8453`) through `https://facilitator.payai.network`. `GET /health` remains free.

The merchant uses only a receiving address. The guarded buyer validates the unpaid `402`, network, USDC contract, recipient, amount, EIP-712 domain and current facilitator capability before it signs. It writes a durable one-attempt record before submitting the paid request.

## Offline verification

```bash
git clone https://github.com/PayAINetwork/docs.git docs
cd docs/examples/base-mainnet-express
npm ci
npm run typecheck
npm run build
npm test
```

These commands make no payment. The tests cover unpaid `402`, paid `200`, settlement response, forged and failed payments, changed requirements, the spending cap, single submission, bounded reconciliation, Base finality, and RPC reporting failures.

The [October 1 Mainnet verification](verification-2026-10-01.json) records an actual unpaid `402`, paid `200`, exact `0.01 USDC` transfer and canonical finalized receipt. A timed-out finality wait was resolved by read-only reconciliation, without paying again. A later method/route guard closes Express's automatic HEAD-to-GET fallback and passes offline regression tests; signing, settlement and locked dependencies are unchanged. This is not a throughput or reliability claim.

## Configure a bounded live check

Create a new disposable EVM wallet using a trusted local wallet tool. Put its `0x`-prefixed private key alone in a file outside this repository and restrict the file:

```bash
chmod 600 /absolute/path/to/disposable-buyer.key
```

Do not paste the key into `.env`, shell history, logs, chat, or command arguments. Fund the buyer with only the USDC you intend to test. The default route charges `10000` atomic units (`0.01 USDC`). EIP-3009 settlement gas is sponsored by the facilitator. An ordinary wallet transfer to recover leftover tokens requires ETH; a separately reviewed sponsored recovery is another option, outside this example.

The merchant needs only a Base address that can receive USDC; its private key does not belong on the API server. Use a merchant that is distinct from the disposable buyer.

Export configuration in each shell that runs the example; the program does not load `.env` automatically:

```bash
export MERCHANT_ADDRESS=0xYourBaseMerchantAddress
export BASE_RPC_URL=https://your-base-mainnet-rpc
export BUYER_KEY_FILE=/absolute/path/to/disposable-buyer.key
export MAX_AMOUNT_ATOMIC=10000
```

`BASE_RPC_URL` must report chain ID `8453` and serve the native Base USDC contract at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Use an RPC that supports the `finalized` block tag. Historical `eth_call` is optional evidence; if the provider cannot read balances at the settlement block, the result records that report as unavailable and never substitutes current balances as historical state.

## Run the merchant

The server binds to loopback by default. For a public check, put it behind an HTTPS reverse proxy and set `PUBLIC_RESOURCE_URL` to the exact public route. Do not trust arbitrary forwarded headers.

```bash
export PUBLIC_RESOURCE_URL=https://your-host.example/premium
npm start
```

In another shell, use the same public URL for the buyer:

```bash
export PREMIUM_URL=https://your-host.example/premium
curl -i "$PREMIUM_URL"
npm run payment:preflight
```

The curl and preflight calls do not pay. The route should return `402` and preflight should print only public addresses, the network, amount, and bounded starting block.

## Deliberately submit once

Only after reviewing preflight and the amount cap:

```bash
npm run payment:once
```

The buyer stores `payment-attempt.json` before sending the authorization. It submits the paid HTTP request once. It separately records:

- the unpaid `402` and required terms;
- the paid HTTP status/body hash and `PAYMENT-RESPONSE`;
- the finalized Base transaction receipt;
- one exact USDC `Transfer` from buyer to merchant for `10000` atomic units;
- the matching `AuthorizationUsed` payer and nonce;
- historical balances at the receipt block when the RPC can serve them.

It never stores or prints the private key or payment signature. Set `PAYMENT_ATTEMPT_FILE` to an absolute path if the guard must live elsewhere.

## Reconcile uncertainty; do not pay again

If the paid HTTP response, finality poll, or optional RPC report fails, keep the guard and run:

```bash
npm run payment:reconcile
```

Reconciliation does not create or submit an authorization. It uses the saved transaction hash when available. Otherwise it searches only the recorded 600-block window for the exact finalized USDC `AuthorizationUsed(authorizer, nonce)` event, then verifies the transaction receipt and exact transfer. It first checks the finalized head and never issues an invalid future-block log query.

Do not delete the guard or use a new guard path while an outcome is uncertain. After a finalized result, archive the evidence before deliberately configuring a separate test. A successful payment is not automatically refundable; recovery is a separate wallet operation with its own gas and safety review.

## Account-free allowance and scaling

Ordinary exact Base Mainnet payments can start without a PayAI portal signup or facilitator API key within the [free allowance](https://docs.payai.network/x402/facilitators/pricing). When you need more capacity, an autonomous agent can [buy a facilitator key and credits over x402](https://docs.payai.network/x402/facilitators/agent-api-keys); vending creates a wallet-owned agent account. The [merchant dashboard](https://merchant.payai.network) is the optional human-managed route.

Live schemes and networks remain authoritative at [`/supported`](https://facilitator.payai.network/supported). See the [maintained guide](https://docs.payai.network/x402/base-mainnet-express) for the complete integration path.
