#!/usr/bin/env python3
"""Validate the v2 reference's illustrative JSON; no network or payment calls."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "x402/reference.mdx"
DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"


def validate(value):
    if isinstance(value, list):
        for child in value:
            validate(child)
    if not isinstance(value, dict):
        return
    if "x402Version" in value:
        assert value["x402Version"] == 2, "v1 message in v2 reference"
    assert "maxAmountRequired" not in value, "v1 amount field in v2 reference"
    if "network" in value:
        assert ":" in value["network"], "network must use CAIP-2"
    if "payload" in value and "x402Version" in value:
        assert "accepted" in value, "v2 payment payload needs accepted"
        assert "scheme" not in value and "network" not in value, "v1 payload layout"
    if "paymentPayload" in value:
        assert value["paymentPayload"]["accepted"] == value["paymentRequirements"], "accepted option and submitted requirements differ"
    if value.get("network") == DEVNET and "asset" in value:
        assert value["asset"] == DEVNET_USDC, "example uses the wrong USDC network"
    if "lastUpdated" in value:
        assert isinstance(value["lastUpdated"], str), "lastUpdated must be a timestamp string"
    if "kinds" in value:
        assert "extensions" in value and "signers" in value, "incomplete supported response"
    for child in value.values():
        validate(child)


blocks = re.findall(r"```json\n(.*?)\n```", REFERENCE.read_text(), re.S)
assert len(blocks) >= 10, "reference JSON coverage unexpectedly disappeared"
for index, block in enumerate(blocks, 1):
    try:
        validate(json.loads(block))
    except (ValueError, AssertionError, KeyError) as error:
        raise SystemExit(f"{REFERENCE.relative_to(ROOT)} JSON block {index}: {error}") from error
print(f"Validated {len(blocks)} v2 reference JSON examples (syntax and message consistency).")

# Authentication examples include JWT claims and an explicitly incomplete
# request outline. Require valid JSON, without pretending the outline is payable.
auth = ROOT / "x402/facilitators/authentication.mdx"
auth_blocks = re.findall(r"```json\n(.*?)\n```", auth.read_text(), re.S)
assert len(auth_blocks) >= 3, "authentication JSON coverage unexpectedly disappeared"
for index, block in enumerate(auth_blocks, 1):
    try:
        json.loads(block)
    except ValueError as error:
        raise SystemExit(f"{auth.relative_to(ROOT)} JSON block {index}: {error}") from error
print(f"Validated {len(auth_blocks)} authentication JSON examples (syntax only).")
