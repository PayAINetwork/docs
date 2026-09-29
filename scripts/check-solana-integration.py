#!/usr/bin/env python3
"""Validate the Solana Mainnet guide, reference and static companion.

With --example-dir, also prove the docs companion's canonical fields match the
runnable example's integration.json. This check never calls RPCs or pays.
"""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import re
import sys
from typing import Any
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parent.parent
GUIDE = ROOT / "x402/solana-mainnet-express.mdx"
IDENTIFIERS = ROOT / "x402/solana-network-identifiers.mdx"
COMPANION = ROOT / "solana-mainnet-integration.json"

EXPECTED_URLS = {
    "guide": "https://docs.payai.network/x402/solana-mainnet-express",
    "networkIdentifiers": "https://docs.payai.network/x402/solana-network-identifiers",
    "metadata": "https://docs.payai.network/solana-mainnet-integration.json",
    "example": "https://github.com/PayAINetwork/docs/tree/main/examples/solana-mainnet-express",
}
CORE_FIELDS = (
    "schemaVersion",
    "testedOn",
    "network",
    "asset",
    "facilitator",
    "packages",
    "urls",
)


def fail(message: str) -> None:
    raise ValueError(message)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        fail(f"{path}: {error}")
    if not isinstance(value, dict):
        fail(f"{path}: top level must be an object")
    return value


def require_https(value: str, label: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        fail(f"{label} must be an absolute HTTPS URL")


def validate_companion(data: dict[str, Any]) -> None:
    if data.get("schemaVersion") != 1:
        fail("schemaVersion must be 1")
    if data.get("kind") != "payai.x402.solana-mainnet-express":
        fail("unexpected schema kind")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(data.get("testedOn", ""))):
        fail("testedOn must use YYYY-MM-DD")
    try:
        datetime.date.fromisoformat(data["testedOn"])
    except ValueError:
        fail("testedOn must be a real calendar date")

    network = data.get("network", {})
    x402 = network.get("x402")
    genesis = network.get("rpcGenesisHash")
    if x402 != "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp":
        fail("unexpected x402 Solana Mainnet identifier")
    if genesis != "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d":
        fail("unexpected full Solana Mainnet genesis hash")
    if x402.removeprefix("solana:") == genesis:
        fail("x402 identifier and full RPC genesis hash must remain distinct")
    if not genesis.startswith(x402.removeprefix("solana:")):
        fail("CAIP-2 reference must be the prefix of the full genesis hash")

    asset = data.get("asset", {})
    expected_asset = {
        "symbol": "USDC",
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "decimals": 6,
        "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    }
    if asset != expected_asset:
        fail("native USDC metadata changed")

    facilitator = data.get("facilitator", {})
    if facilitator != {
        "url": "https://facilitator.payai.network",
        "capabilitiesPath": "/supported",
    }:
        fail("unexpected facilitator configuration")

    packages = data.get("packages", {})
    if not isinstance(packages, dict) or not packages:
        fail("packages must be a non-empty object")
    for package, version in packages.items():
        if not isinstance(package, str) or not re.fullmatch(r"\d+\.\d+\.\d+", str(version)):
            fail(f"packages.{package} must be an exact semantic version")

    prerequisites = data.get("prerequisites")
    required_prerequisites = {
        "node",
        "merchantAddress",
        "merchantUsdcAccount",
        "buyerKeypairFile",
        "buyerUsdc",
        "solanaRpc",
    }
    if not isinstance(prerequisites, dict) or set(prerequisites) != required_prerequisites:
        fail("prerequisites keys do not match schema version 1")
    if not all(isinstance(value, str) and value for value in prerequisites.values()):
        fail("prerequisites values must be non-empty strings")

    if data.get("urls") != EXPECTED_URLS:
        fail("canonical URLs changed")
    for key, url in EXPECTED_URLS.items():
        require_https(url, f"urls.{key}")

    authority = data.get("authority", {})
    operational = authority.get("operationalCapabilities")
    if operational != "https://facilitator.payai.network/supported":
        fail("live /supported URL must be the operational authority")
    require_https(operational, "authority.operationalCapabilities")
    if not isinstance(authority.get("note"), str) or not authority["note"]:
        fail("authority.note must explain live capability precedence")

    generated_from = data.get("generatedFrom", {})
    if generated_from != {
        "path": "examples/solana-mainnet-express/integration.json",
        "url": "https://github.com/PayAINetwork/docs/blob/main/examples/solana-mainnet-express/integration.json",
    }:
        fail("generatedFrom must identify the canonical example integration.json")
    require_https(generated_from["url"], "generatedFrom.url")


def validate_docs(data: dict[str, Any]) -> None:
    guide = GUIDE.read_text()
    identifiers = IDENTIFIERS.read_text()
    combined = guide + "\n" + identifiers

    constants = [
        data["network"]["x402"],
        data["network"]["rpcGenesisHash"],
        data["asset"]["mint"],
        data["asset"]["tokenProgram"],
        data["facilitator"]["url"],
        *data["packages"].keys(),
        *data["packages"].values(),
    ]
    missing = [value for value in constants if value not in combined]
    if missing:
        fail(f"docs omit canonical values: {missing}")

    if data["network"]["x402"] not in identifiers or data["network"]["rpcGenesisHash"] not in identifiers:
        fail("identifier reference must show both network identifiers")
    if "CURRENT_FEE_PAYER_ADDRESS" not in guide or ".find(" not in guide:
        fail("guide must show a non-hardcoded /supported capability selection")
    for package, version in data["packages"].items():
        if f"| `{package}` | `{version}` |" not in guide:
            fail(f"guide must directly pair {package} with tested version {version}")
    if data["urls"]["example"] not in guide:
        fail("guide must link urls.example")
    if "](/solana-mainnet-integration.json)" not in combined:
        fail("docs must link the root static companion as a local asset")

    short = data["network"]["x402"].removeprefix("solana:")
    full = data["network"]["rpcGenesisHash"]
    found_mainnet_refs = set(re.findall(r"5eykt[1-9A-HJ-NP-Za-km-z]+", combined))
    if found_mainnet_refs != {short, full}:
        fail(f"docs contain stale or missing Mainnet references: {sorted(found_mainnet_refs)}")
    found_networks = set(re.findall(r"solana:[1-9A-HJ-NP-Za-km-z]+", combined))
    if found_networks != {data["network"]["x402"]}:
        fail(f"docs contain stale or missing x402 networks: {sorted(found_networks)}")
    found_usdc = set(re.findall(r"EPj[1-9A-HJ-NP-Za-km-z]+", combined))
    if found_usdc != {data["asset"]["mint"]}:
        fail(f"docs contain stale or missing native USDC mints: {sorted(found_usdc)}")
    found_programs = set(re.findall(r"Tokenkeg[1-9A-HJ-NP-Za-km-z]+", combined))
    if found_programs != {data["asset"]["tokenProgram"]}:
        fail(f"docs contain stale or missing Token Program IDs: {sorted(found_programs)}")

    runtime_snippets = (
        f'export const SOLANA_MAINNET =\n  "{data["network"]["x402"]}";',
        f'export const NATIVE_USDC =\n  "{data["asset"]["mint"]}";',
        f'"{data["network"]["rpcGenesisHash"]}";',
    )
    for snippet in runtime_snippets:
        if snippet not in combined:
            fail(f"runtime snippet does not derive from companion: {snippet!r}")

    json_blocks = re.findall(r"```json\n(.*?)\n```", combined, re.S)
    if not json_blocks:
        fail("expected a real-shaped /supported JSON example")
    for index, block in enumerate(json_blocks, 1):
        try:
            json.loads(block)
        except json.JSONDecodeError as error:
            fail(f"JSON code block {index} is invalid: {error}")


def compare_example(data: dict[str, Any], example_dir: pathlib.Path) -> None:
    source = load_json(example_dir / "integration.json")
    mismatches = [field for field in CORE_FIELDS if source.get(field) != data.get(field)]
    if mismatches:
        fail(f"static companion differs from example integration.json: {', '.join(mismatches)}")
    package_json = load_json(example_dir / "package.json")
    if package_json.get("dependencies") != data.get("packages"):
        fail("static companion packages differ from example package.json dependencies")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--example-dir",
        type=pathlib.Path,
        help="path to examples/solana-mainnet-express",
    )
    args = parser.parse_args()

    try:
        companion = load_json(COMPANION)
        validate_companion(companion)
        validate_docs(companion)
        if args.example_dir:
            compare_example(companion, args.example_dir.resolve())
    except (OSError, KeyError, TypeError, ValueError) as error:
        print(f"Solana integration validation failed: {error}", file=sys.stderr)
        return 1

    suffix = " and runnable example" if args.example_dir else ""
    print(f"Validated Solana integration docs, metadata{suffix}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
