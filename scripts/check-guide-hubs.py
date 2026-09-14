#!/usr/bin/env python3
"""Keep integration guide links in plain Markdown, outside client-side tabs."""

import pathlib
import re
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent


def plain_links(source):
    source = re.sub(r"<Tabs\b.*?</Tabs>", "", source, flags=re.S)
    source = re.sub(r"```.*?```", "", source, flags=re.S)
    return set(re.findall(r"\]\((/[^)\s#]+)\)", source))


def validate(root):
    errors = []
    for family in ("clients", "servers"):
        directory = root / "x402" / family
        hub = directory / "introduction.mdx"
        source = hub.read_text()
        expected = {
            "/" + page.relative_to(root).with_suffix("").as_posix()
            for page in directory.rglob("*.mdx") if page != hub
        }
        for missing in sorted(expected - plain_links(source)):
            errors.append(f"{family} hub: missing plain link to {missing}")
        for obsolete in (
            "x402-fetch", "x402-axios", "from x402.clients",
            "Payment settles in < 1 second",
            "Universal compatibility -- if it speaks HTTP",
        ):
            if obsolete in source:
                errors.append(f"{family} hub: obsolete guidance: {obsolete}")

    required = {
        "/x402/quickstart", "/x402/clients/introduction",
        "/x402/servers/introduction", "/x402/facilitators/introduction",
        "/x402/servers/batch-settlement", "/x402/facilitators/pricing",
        "/x402/facilitators/authentication", "/x402/supported-networks",
        "/x402/facilitators/capacity-and-limits",
    }
    for missing in sorted(required - plain_links((root / "introduction.mdx").read_text())):
        errors.append(f"main introduction: missing plain link to {missing}")

    diagram = root / "images/x402-sequence-diagram.svg"
    if diagram.exists():
        labels = " ".join(ET.parse(diagram).getroot().itertext())
        if "PAYMENT-SIGANTURE" in labels or "PAYMENT-SIGNATURE" not in labels:
            errors.append("sequence diagram: incorrect payment signature header")
    return errors


if __name__ == "__main__":
    failures = validate(ROOT)
    if failures:
        raise SystemExit("\n".join(failures))
    print("Guide indexes and sequence diagram checks pass.")
