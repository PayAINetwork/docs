# x402 Solana Mainnet Express example with PayAI

This standalone TypeScript project protects `GET /premium` with native Solana Mainnet USDC and leaves `GET /health` free. It uses released packages only: x402 `2.27.0` and `@payai/facilitator` `2.4.4`. [`integration.json`](./integration.json) is the source of truth for the network identifiers, asset, token program, facilitator and tested runtime versions.

## Install and run the merchant

Use Node.js 20.18 or newer (tested on Node.js 24), an HTTPS Solana Mainnet RPC, and a valid Solana receiving address.

```sh
npm ci
export MERCHANT_ADDRESS=YOUR_MERCHANT_SOLANA_ADDRESS
npm start
```

For an HTTPS deployment behind a TLS-terminating proxy, set `PUBLIC_RESOURCE_URL=https://YOUR_HOST/premium` on the server and `PREMIUM_URL` to the same URL for the smoke buyer. The explicit resource URL keeps the `402` metadata on HTTPS without trusting arbitrary forwarded headers. The example binds to loopback by default; set `HOST=0.0.0.0` only when your deployment requires it and applies its normal network controls.

The standard `HTTPFacilitatorClient` receives the config exported by `@payai/facilitator`. Ordinary exact payments can start without credentials using the current allowance of 1,000 lifetime free credits per new receiving wallet; shared host/IP limits can apply. One credit is $0.001. Each settlement consumes its live network rate, calculated from settlement gas plus 30%; it does not necessarily consume one credit. Set `PAYAI_API_KEY_ID` and `PAYAI_API_KEY_SECRET` for authenticated credit use; the helper creates short-lived Bearer JWTs. See the [pricing guide](https://docs.payai.network/x402/facilitators/pricing) and live [`/supported`](https://facilitator.payai.network/supported) response for current rates.

## Create the merchant USDC account first

The receiving wallet must already have its native USDC associated token account (ATA). The setup signer below pays account rent. That is separate from payment settlement gas, which the active facilitator fee payer sponsors.

```sh
export SOLANA_RPC_URL=https://YOUR_MAINNET_RPC
export SETUP_KEYPAIR_FILE=/absolute/path/to/setup-fee-payer.json
export USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

npm run build
MERCHANT_ATA="$(node --input-type=module -e \
  'import { getUsdcAta } from "./dist/rpc.js"; console.log(await getUsdcAta(process.env.MERCHANT_ADDRESS));')"
solana account "$MERCHANT_ATA" --url "$SOLANA_RPC_URL" >/dev/null 2>&1 || \
  spl-token create-account "$USDC_MINT" \
    --owner "$MERCHANT_ADDRESS" \
    --fee-payer "$SETUP_KEYPAIR_FILE" \
    --url "$SOLANA_RPC_URL"
```

The smoke preflight also derives and checks this exact ATA. It reads the facilitator's live `/supported` response and selects the fee payer advertised for x402 v2 `exact` on Solana Mainnet; no fee-payer address is hardcoded.

## Guarded buyer smoke test

Use only a disposable buyer file containing the Solana CLI's 64-byte JSON keypair array. Fund its native USDC ATA with no more than the intended test amount. The script never logs key material.

If the merchant uses an authenticated facilitator lane, a trusted smoke operator may set the merchant's PayAI credentials so `/supported` returns that same lane. Merchant credentials belong only in the server and this operator-controlled smoke environment; never give them to independent buyers.

```sh
export MERCHANT_ADDRESS=YOUR_MERCHANT_SOLANA_ADDRESS
export SOLANA_RPC_URL=https://YOUR_MAINNET_RPC
export BUYER_KEYPAIR_FILE=/absolute/path/to/disposable-buyer.json
export MAX_AMOUNT_ATOMIC=1000

npm run payment:preflight
npm run payment:once
```

Preflight is read-only. It asserts the full Mainnet genesis hash, checks both USDC ATAs and balance, obtains the live fee payer, requests the unpaid `402`, and rejects any scheme, network, mint, recipient, fee payer, timeout or amount-cap mismatch.

`payment:once` creates `payment-attempt.json` with exclusive creation before signing or submission. The file binds the URL, network, mint, merchant, buyer and amount and permanently prevents another authorization at that path. It records actual HTTP response bytes, original payment headers, SHA-256 hashes and timestamps. After a response it requires a successful, correctly bound `PAYMENT-RESPONSE`, finalized on-chain status, a matching transaction-message hash, transaction metadata deltas, and exact integer ATA balance deltas.

If the paid HTTP outcome is lost or unreadable, the attempt remains `uncertain`. Never delete the guard or run `payment:once` again. Reconcile the existing authorization:

```sh
npm run payment:reconcile
```

Reconciliation never submits a payment. It uses a receipt signature when available or searches the merchant ATA for the persisted signed-message fingerprint, then applies the same finalization, payer and integer-balance checks. A finalized record separately states whether an observed HTTP `200` delivered the protected resource.

## Recover a disposable test payment

Recovery is a separate transaction; the recovery fee payer funds its gas and any recipient-account rent. Retain the disposable merchant owner signer. First build the read-only balance helper and record both finalized integer balances:

```sh
npm run build
export FUNDER_ADDRESS=YOUR_DISPOSABLE_FUNDER_ADDRESS
balances() {
  node --input-type=module -e '
    import { assertSolanaMainnetRpc, readUsdcAta } from "./dist/rpc.js";
    const rpc = process.env.SOLANA_RPC_URL;
    await assertSolanaMainnetRpc(rpc);
    const balances = {};
    for (const owner of process.argv.slice(1)) {
      const account = await readUsdcAta(rpc, owner);
      if (!account) throw new Error(`Missing USDC ATA for ${owner}`);
      balances[owner] = account.amountAtomic.toString();
    }
    console.log(JSON.stringify(balances));
  ' "$MERCHANT_ADDRESS" "$FUNDER_ADDRESS"
}
balances | tee recovery-before.json
```

For this example's `1000`-atomic payment, return `0.001` USDC. Confirm that amount in the attempt record before sending:

```sh
spl-token transfer "$USDC_MINT" 0.001 "$FUNDER_ADDRESS" \
  --owner /absolute/path/to/disposable-merchant-owner.json \
  --fee-payer /absolute/path/to/recovery-fee-payer.json \
  --fund-recipient --url "$SOLANA_RPC_URL"
```

Record the recovery signature, independently confirm it is finalized, and capture the balances again:

```sh
solana confirm YOUR_RECOVERY_SIGNATURE --commitment finalized --url "$SOLANA_RPC_URL"
balances | tee recovery-after.json
```

Using integer arithmetic, require the funder's increase and merchant's decrease to each equal `1000`. Keep both JSON snapshots and the signature with the payment record.

Only after the recovery is finalized and the merchant ATA balance is zero, close it:

```sh
spl-token close --address "$MERCHANT_ATA" \
  --owner /absolute/path/to/disposable-merchant-owner.json \
  --fee-payer /absolute/path/to/recovery-fee-payer.json \
  --recipient YOUR_RECOVERY_RENT_ADDRESS \
  --url "$SOLANA_RPC_URL"
```

Keep the payment record, settlement signature, recovery signature and before/after integer balances. Do not close an ATA that still holds tokens.

## Validate without paying

```sh
npm run typecheck
npm run build
npm test
```

Tests use a local Express server, a deterministic mock facilitator and mocked RPC responses. They make no live payment. On 2026-09-30 the shipped example at commit `a3669bd148afd60f4ff1c3893c0a1e8c2baab8cd` completed an unauthenticated 1,000-atomic-USDC Mainnet payment over temporary public HTTPS, delivered the protected resource, finalized, and fully recovered the USDC. See [the receipt](./verification-2026-09-30.json). Setup/recovery CLI instructions were corrected during that test. The optional public resource URL was added afterward and tested without another payment; the frozen original advertised an HTTP resource URL behind TLS termination. This is a single smoke test, not a durable deployment or throughput benchmark.

See the canonical [Solana Mainnet Express guide](https://docs.payai.network/x402/solana-mainnet-express) and [network identifier reference](https://docs.payai.network/x402/solana-network-identifiers).
