#!/usr/bin/env python3
"""Reject vendored or personal-account x402 SDK dependencies in tracked files."""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
FORBIDDEN = {
    "PayAI preview repository": re.compile(r"PayAI" r"Network/x402-batch-preview", re.I),
    "personal GitHub account": re.compile(r"github\.com/" r"notorious-d-e-v", re.I),
    "GitHub x402 tarball": re.compile(r"https?://github\.com/\S*x402\S*\.tgz", re.I),
}


def tracked_files() -> list[pathlib.Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    return [ROOT / name.decode() for name in result.stdout.split(b"\0") if name]


def check_package_dependencies(path: pathlib.Path, failures: list[str]) -> None:
    if path.name not in {"package.json", "package-lock.json"}:
        return
    data = json.loads(path.read_text())
    objects = [data]
    if isinstance(data.get("packages"), dict):
        objects.extend(value for value in data["packages"].values() if isinstance(value, dict))
    for obj in objects:
        for field in ("dependencies", "devDependencies", "optionalDependencies", "overrides"):
            for name, value in obj.get(field, {}).items():
                if isinstance(value, str) and value.startswith("file:"):
                    failures.append(f"{path.relative_to(ROOT)}: {field}.{name} uses {value}")


def main() -> int:
    failures: list[str] = []
    for path in tracked_files():
        text = path.read_text(errors="replace")
        for label, pattern in FORBIDDEN.items():
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                failures.append(f"{path.relative_to(ROOT)}:{line}: {label}")
        check_package_dependencies(path, failures)

    if failures:
        print("Vendored x402 SDK references found:", file=sys.stderr)
        print("\n".join(f"- {failure}" for failure in failures), file=sys.stderr)
        return 1
    print("Upstream x402 SDK dependency check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
