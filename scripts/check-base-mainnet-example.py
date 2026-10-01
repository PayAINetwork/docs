#!/usr/bin/env python3
"""Offline consistency and safety checks for the Base Mainnet example."""

import json
import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples/base-mainnet-express"
GUIDE = ROOT / "x402/base-mainnet-express.mdx"
CANONICAL = ROOT / "guides/accept-payments-from-ai-agents.mdx"


def fail(message: str) -> None:
    raise ValueError(message)


def main() -> int:
    try:
        integration = json.loads((EXAMPLE / "integration.json").read_text())
        package = json.loads((EXAMPLE / "package.json").read_text())
        guide = GUIDE.read_text()
        canonical = CANONICAL.read_text()
        readme = (EXAMPLE / "README.md").read_text()
        smoke = (EXAMPLE / "src/smoke.ts").read_text()
        chain = (EXAMPLE / "src/chain.ts").read_text()

        if integration["kind"] != "payai.x402.base-mainnet-express":
            fail("unexpected integration kind")
        if integration["network"] != {"x402": "eip155:8453", "chainId": 8453}:
            fail("Base Mainnet identifiers changed")
        asset = integration["asset"]
        if asset != {
            "symbol": "USDC",
            "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "decimals": 6,
            "eip712Name": "USD Coin",
            "eip712Version": "2",
        }:
            fail("native Base USDC metadata changed")
        if package["dependencies"] != integration["packages"]:
            fail("package dependencies differ from integration metadata")

        combined = guide + "\n" + readme
        for value in (
            integration["network"]["x402"],
            integration["asset"]["address"],
            integration["facilitator"]["url"],
            *integration["packages"].keys(),
            *integration["packages"].values(),
        ):
            if str(value) not in combined:
                fail(f"guide/README omit canonical value: {value}")

        for required in (
            "reconciliationEndBlock",
            "RECONCILIATION_WINDOW_BLOCKS",
            "Never pay again",
            "paymentSignatureHeaderSha256",
        ):
            if required not in smoke:
                fail(f"smoke runner lost safety marker: {required}")
        for required in (
            "AuthorizationUsed",
            "Transfer",
            'blockTag: "finalized"',
            "No latest-state fallback",
        ):
            if required not in chain + smoke:
                fail(f"chain verification lost safety marker: {required}")
        if re.search(r"process\.env\.(?:EVM_PRIVATE_KEY|PRIVATE_KEY)", smoke + readme):
            fail("buyer private key must not be passed through the environment")
        if "BUYER_KEY_FILE" not in readme or "chmod 600" not in readme:
            fail("README must document file-based key isolation")

        for target in (
            "/x402/base-mainnet-express",
            "https://github.com/x402-foundation/x402/blob/main/docs/getting-started/quickstart-for-sellers.mdx",
            "https://github.com/x402-foundation/x402/blob/main/docs/dev-tools/facilitators.md",
        ):
            if target not in canonical + guide:
                fail(f"discovery path omits {target}")
        if "x402, Stripe, or both?" not in canonical:
            fail("canonical guide lost the x402/commerce boundary")
        if "does not claim that PayAI implements MPP" not in canonical:
            fail("canonical guide must explicitly avoid a PayAI MPP claim")
    except (KeyError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Base Mainnet example validation failed: {error}", file=sys.stderr)
        return 1

    print("Validated Base Mainnet example metadata, docs, and safety invariants.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
