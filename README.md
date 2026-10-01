# Mintlify Starter Kit

Use the starter kit to get your docs deployed and ready to customize.

Click the green **Use this template** button at the top of this repo to copy the Mintlify starter kit. The starter kit contains examples with

- Guide pages
- Navigation
- Customizations
- API reference pages
- Use of popular components

**[Follow the full quickstart guide](https://starter.mintlify.com/quickstart)**

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview your documentation changes locally. To install, use the following command:

```
npm i -g mint
```

Run the following command at the root of your documentation, where your `docs.json` is located:

```
mint dev
```

View your local preview at `http://localhost:3000`.

## Publishing changes

Install our GitHub app from your [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) to propagate changes from your repo to your deployment. Changes are deployed to production automatically after pushing to the default branch.

## Need help?

### Troubleshooting

- If your dev environment isn't running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources
- [Mintlify documentation](https://mintlify.com/docs)
- [Mintlify community](https://mintlify.com/community)

## Runnable integration

The [Solana Mainnet Express merchant and buyer](examples/solana-mainnet-express/) uses exact released npm packages and includes deterministic payment-flow tests. Follow the [canonical guide](https://docs.payai.network/x402/solana-mainnet-express).

The [Base Mainnet Express merchant and buyer](examples/base-mainnet-express/) adds a one-cent USDC route, a single-attempt buyer, and canonical finalized-receipt verification. Start with the [agent-payments guide](https://docs.payai.network/guides/accept-payments-from-ai-agents).

## IndexNow ownership file

`fa8ac188ceb4559d3724e23d0f512617.txt` is a public ownership key, not an account credential. Before submitting changed canonical URLs, verify the deployed root URL returns the exact file as raw text. Submit only added, materially changed, redirected or deleted URLs; the sitemap remains the full inventory. Record submission responses separately from actual index status: acceptance does not guarantee indexing.

To rotate, deploy and verify a new random key file, switch submissions to it, then remove the old file after callers have migrated. Do not add key files to navigation or include secrets in submissions. See the [IndexNow protocol](https://www.indexnow.org/documentation).
