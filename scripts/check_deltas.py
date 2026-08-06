#!/usr/bin/env python3
"""Assert the PayAI-specific parts of each example survived an upstream sync.

Compiling proves the code works. Paying proves it works end to end. Neither
proves it is still *ours*. If upstream restructures such that a valid,
compiling, paying example quietly reverts to the x402.org facilitator or drops
Solana, every other gate goes green while the docs stop selling PayAI.

These assertions are the difference between "the sync produced working code"
and "the sync produced our working code".

Usage:
    python3 scripts/check_deltas.py
    python3 scripts/check_deltas.py express hono
"""
import re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SOLANA = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
BASE_SEPOLIA = "eip155:84532"

# key -> (page, fence language, [(human-readable requirement, substring), ...])
RULES = {
    "express": ("x402/servers/typescript/express.mdx", "ts", [
        ("routes payments through the PayAI facilitator", '@payai/facilitator'),
        ("declares itself to the bazaar",                 'declareDiscoveryExtension'),
        ("offers Base Sepolia",                           BASE_SEPOLIA),
        ("offers Solana",                                 SOLANA),
    ]),
    "hono": ("x402/servers/typescript/hono.mdx", "ts", [
        ("routes payments through the PayAI facilitator", '@payai/facilitator'),
        ("declares itself to the bazaar",                 'declareDiscoveryExtension'),
        ("offers Base Sepolia",                           BASE_SEPOLIA),
        ("offers Solana",                                 SOLANA),
    ]),
    "nextjs": ("x402/servers/typescript/nextjs.mdx", "typescript", [
        ("routes payments through the PayAI facilitator", '@payai/facilitator'),
        ("declares itself to the bazaar",                 'declareDiscoveryExtension'),
        ("offers Base Sepolia",                           BASE_SEPOLIA),
        ("offers Solana",                                 SOLANA),
    ]),
    # Clients talk to no facilitator, but must still be able to pay on both chains.
    "fetch": ("x402/clients/typescript/fetch.mdx", "ts", [
        ("can pay on EVM",   '@x402/evm'),
        ("can pay on Solana", '@x402/svm'),
    ]),
    "axios": ("x402/clients/typescript/axios.mdx", "ts", [
        ("can pay on EVM",   '@x402/evm'),
        ("can pay on Solana", '@x402/svm'),
    ]),
}


def page_code(page, lang):
    text = (ROOT / page).read_text()
    blocks = re.findall(r"```" + lang + r"\n(.*?)```", text, re.S)
    return "\n".join(blocks)          # all blocks — nextjs splits across two


def main():
    keys = sys.argv[1:] or list(RULES)
    unknown = [k for k in keys if k not in RULES]
    if unknown:
        print(f"unknown page(s): {', '.join(unknown)}; known: {', '.join(RULES)}")
        return 2

    failures = []
    for key in keys:
        page, lang, rules = RULES[key]
        code = page_code(page, lang)
        missing = [desc for desc, needle in rules if needle not in code]
        if missing:
            failures.append(key)
            print(f"✗ {key} ({page})")
            for m in missing:
                print(f"    no longer {m}")
        else:
            print(f"✓ {key}: all {len(rules)} PayAI assertions hold")

    if failures:
        print(f"\nDELTA LOST: {', '.join(failures)}")
        print("An upstream sync stripped something PayAI-specific. Do not auto-merge —")
        print("decide whether the delta should be reapplied or whether our guidance changed.")
        return 1
    print(f"\nAll {len(keys)} page(s) retain their PayAI delta.")
    return 0


sys.exit(main())
