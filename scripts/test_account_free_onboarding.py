#!/usr/bin/env python3
"""Regression checks for account-free ordinary exact-payment onboarding."""

import importlib.util
import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parent.parent
AGENT_KEYS = "/x402/facilitators/agent-api-keys"
DASHBOARD = "https://merchant.payai.network"

EXACT_GUIDES = (
    "x402/servers/typescript/express.mdx",
    "x402/servers/typescript/hono.mdx",
    "x402/servers/typescript/nextjs.mdx",
    "x402/servers/python/fastapi.mdx",
    "x402/servers/python/flask.mdx",
    "x402/servers/go/gin.mdx",
)

ONBOARDING_PAGES = EXACT_GUIDES + (
    "x402/quickstart.mdx",
    "x402/introduction.mdx",
    "x402/servers/introduction.mdx",
    "x402/solana-mainnet-express.mdx",
    "x402/facilitators/introduction.mdx",
    "x402/facilitators/authentication.mdx",
    "x402/facilitators/pricing.mdx",
)


def source(path):
    return (ROOT / path).read_text()


class AccountFreeOnboardingTest(unittest.TestCase):
    def test_exact_guides_do_not_make_portal_signup_a_production_gate(self):
        for path in EXACT_GUIDES:
            with self.subTest(path=path):
                text = source(path)
                self.assertIn("mainnet payments in production", text)
                self.assertIn("The examples above use testnets.", text)
                self.assertIn("adding credentials alone does not switch networks", text)
                self.assertIn("no API key or portal signup", text)
                self.assertIn(AGENT_KEYS, text)
                self.assertIn(DASHBOARD, text)

    def test_onboarding_pages_link_both_scaling_routes(self):
        for path in ONBOARDING_PAGES:
            with self.subTest(path=path):
                text = source(path)
                self.assertIn(AGENT_KEYS, text)
                self.assertIn(DASHBOARD, text)

    def test_portal_only_production_instructions_do_not_return(self):
        corpus = "\n".join(source(path) for path in ONBOARDING_PAGES)
        forbidden = (
            r"When you're ready for production, create a merchant account",
            r"For production, configure the PayAI merchant credentials",
            r"merchants log into a dashboard and top up credits",
            r"without creating an account",
        )
        for pattern in forbidden:
            with self.subTest(pattern=pattern):
                self.assertIsNone(re.search(pattern, corpus, re.IGNORECASE))

    def test_wallet_owned_account_and_portal_linked_wallet_are_explained(self):
        pricing = source("x402/facilitators/pricing.mdx")
        self.assertIn("wallet-owned agent account", pricing)
        self.assertIn("already linked to a portal account", pricing)
        self.assertIn("receives credits but not a new agent key", pricing)

    def test_batch_capability_is_not_described_as_universally_authenticated(self):
        intro = source("x402/introduction.mdx")
        self.assertIn("public shared", intro)
        self.assertNotRegex(intro, r"requires them for\s*\[batch settlement\]")

    def test_solana_setup_and_recovery_commands_are_cli_compatible(self):
        for path in (
            "x402/solana-mainnet-express.mdx",
            "examples/solana-mainnet-express/README.md",
        ):
            with self.subTest(path=path):
                text = source(path)
                self.assertIn("getUsdcAta", text)
                self.assertNotIn("spl-token address", text)
                shell_blocks = re.findall(r"```(?:bash|sh)\n(.*?)```", text, re.S)
                spl_token_blocks = [block for block in shell_blocks if "spl-token" in block]
                self.assertTrue(spl_token_blocks)
                for block in spl_token_blocks:
                    self.assertNotIn("--commitment", block)

        readme = source("examples/solana-mainnet-express/README.md")
        self.assertIn('spl-token close --address "$MERCHANT_ATA"', readme)

    def test_upstream_sync_preserves_onboarding_suffix(self):
        spec = importlib.util.spec_from_file_location(
            "sync_upstream", ROOT / "scripts/sync_upstream.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        suffix = (
            "\n## Going to production\n\n"
            "No portal signup. See [agent keys](/x402/facilitators/agent-api-keys).\n"
        )
        page = "Before\n\n```ts\nold\n```" + suffix
        updated = module.replace_page_block(page, "ts", "old\n", "new\n")
        self.assertEqual(updated, "Before\n\n```ts\nnew\n```" + suffix)

        for key in ("express", "hono", "fastapi", "flask", "gin"):
            path, _upstream, language, index = module.PAGES[key]
            with self.subTest(key=key):
                text = source(path)
                current, _text, _blocks = module.page_block(path, language, index)
                synced_fence = f"```{language}\n{current}```"
                suffix = text.split(synced_fence, 1)[1]
                self.assertIn(AGENT_KEYS, suffix)
                patch = source(f"patches/{key}.patch")
                self.assertNotIn("create a merchant account", patch.lower())


if __name__ == "__main__":
    unittest.main()
