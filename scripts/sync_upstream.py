#!/usr/bin/env python3
"""Keep the docs' code examples in step with x402-foundation/x402.

Each covered page maps to one upstream example file plus a patch holding the
PayAI-specific delta (the facilitator swap, bazaar discovery). Syncing is:

    fetch upstream file  ->  apply patches/<key>.patch  ->  expected page code

If the expected code differs from what the page currently shows, upstream moved
and the page is stale. ``--write`` updates the page; ``--check`` just reports.

If the patch no longer applies, upstream has moved the ground under our
customization. That is deliberately a hard failure: it means a human should
decide what the delta should become, not a script.

Usage:
    python3 scripts/sync_upstream.py --check     # report drift, exit 1 if any
    python3 scripts/sync_upstream.py --write     # apply drift to the pages
    python3 scripts/sync_upstream.py --check express hono
"""
import argparse, base64, json, pathlib, re, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
UPSTREAM_REPO = "x402-foundation/x402"

# key -> (docs page, upstream path, fence language, which block on the page)
PAGES = {
    "express": ("x402/servers/typescript/express.mdx",
                "examples/typescript/servers/express/index.ts", "ts", 0),
    "hono":    ("x402/servers/typescript/hono.mdx",
                "examples/typescript/servers/hono/index.ts", "ts", 0),
    "fetch":   ("x402/clients/typescript/fetch.mdx",
                "examples/typescript/clients/fetch/index.ts", "ts", 0),
    "axios":   ("x402/clients/typescript/axios.mdx",
                "examples/typescript/clients/axios/index.ts", "ts", 0),
    # Expansion path — each is data, not code:
    #   nextjs  (multi-file: proxy.ts + app/api/weather/route.ts)
    #   fastapi, flask, httpx, requests   (python)
    #   gin, go-http                       (go)
}


def gh_api(path):
    r = subprocess.run(["gh", "api", path, "--jq", ".content"],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"gh api {path} failed: {r.stderr.strip()[:200]}")
    return base64.b64decode(r.stdout).decode()


def upstream_file(path):
    return gh_api(f"repos/{UPSTREAM_REPO}/contents/{path}")


def upstream_sha(path):
    r = subprocess.run(["gh", "api", f"repos/{UPSTREAM_REPO}/commits?path={path}&per_page=1",
                        "--jq", ".[0].sha"], capture_output=True, text=True)
    return (r.stdout or "").strip()[:12] if r.returncode == 0 else "unknown"


def page_block(page, lang, index):
    text = (ROOT / page).read_text()
    blocks = re.findall(r"```" + lang + r"\n(.*?)```", text, re.S)
    if len(blocks) <= index:
        raise RuntimeError(f"{page}: expected block #{index}, found {len(blocks)}")
    return blocks[index], text, blocks


def expected_code(key, up_text, work):
    """upstream + our patch = what the page should show."""
    f = work / f"{key}.ts"
    f.write_text(up_text)
    patch = ROOT / "patches" / f"{key}.patch"
    if not patch.exists() or not patch.read_text().strip():
        return f.read_text(), None            # no delta: pure upstream mirror
    r = subprocess.run(["git", "apply", "-p1", "--verbose", str(patch)],
                       cwd=work, capture_output=True, text=True)
    if r.returncode:
        return None, r.stderr.strip()[:500]
    return f.read_text(), None


def sync(keys, write):
    work = pathlib.Path(tempfile.mkdtemp(prefix="upstream-sync-"))
    drifted, conflicts = [], []
    try:
        for key in keys:
            page, up_path, lang, idx = PAGES[key]
            up_text = upstream_file(up_path)
            sha = upstream_sha(up_path)
            expected, err = expected_code(key, up_text, work)

            if expected is None:
                conflicts.append(key)
                print(f"✗ {key}: patch no longer applies against upstream@{sha}")
                print(f"    {err}")
                print("    A human needs to decide what the PayAI delta should become.\n")
                continue

            current, text, blocks = page_block(page, lang, idx)
            if current.rstrip("\n") == expected.rstrip("\n"):
                print(f"✓ {key}: in sync with upstream@{sha}")
                continue

            drifted.append((key, sha))
            cur_lines, exp_lines = current.splitlines(), expected.splitlines()
            print(f"! {key}: upstream moved (upstream@{sha}) — "
                  f"{len(cur_lines)} -> {len(exp_lines)} lines")
            import difflib
            for line in list(difflib.unified_diff(
                    cur_lines, exp_lines,
                    fromfile=f"docs/{key}", tofile=f"expected/{key}", lineterm=""))[:40]:
                print("    " + line)
            if write:
                new = text.replace("```" + lang + "\n" + current + "```",
                                   "```" + lang + "\n" + expected.rstrip("\n") + "\n```", 1)
                (ROOT / page).write_text(new)
                print(f"    updated {page}")
            print()
    finally:
        shutil.rmtree(work, ignore_errors=True)

    summary = {"drifted": [k for k, _ in drifted], "conflicts": conflicts,
               "shas": {k: s for k, s in drifted}}
    (ROOT / ".sync-result.json").write_text(json.dumps(summary, indent=2))
    return drifted, conflicts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="*", default=None)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true", help="report drift only")
    g.add_argument("--write", action="store_true", help="apply drift to the pages")
    g.add_argument("--regen", action="store_true",
                   help="rebuild patches/ from the pages as they are now — run this "
                        "after hand-editing a page's PayAI delta, or the next sync "
                        "will treat your edit as drift and revert it")
    a = ap.parse_args()

    keys = a.keys or list(PAGES)
    unknown = [k for k in keys if k not in PAGES]
    if unknown:
        print(f"unknown page(s): {', '.join(unknown)}; known: {', '.join(PAGES)}")
        return 2

    if a.regen:
        work = pathlib.Path(tempfile.mkdtemp(prefix="regen-"))
        try:
            for key in keys:
                page, up_path, lang, idx = PAGES[key]
                up = work / f"{key}.up"; up.write_text(upstream_file(up_path))
                ours = work / f"{key}.ours"
                ours.write_text(page_block(page, lang, idx)[0])
                r = subprocess.run(
                    ["diff", "-u", "--label", f"a/{key}.ts", "--label", f"b/{key}.ts",
                     str(up), str(ours)], capture_output=True, text=True)
                out = ROOT / "patches" / f"{key}.patch"
                out.write_text(r.stdout)
                n = len([l for l in r.stdout.splitlines()
                         if l[:1] in "+-" and not l.startswith(("+++", "---"))])
                print(f"  {key}: {n} changed line(s) -> {out.relative_to(ROOT)}")
        finally:
            shutil.rmtree(work, ignore_errors=True)
        print("\nPatches regenerated. Commit them alongside the page edit.")
        return 0

    print(f"syncing {len(keys)} page(s) against {UPSTREAM_REPO}\n")
    drifted, conflicts = sync(keys, a.write)

    if conflicts:
        print(f"CONFLICT: {', '.join(conflicts)} — patch needs a human")
        return 2
    if drifted:
        names = ', '.join(k for k, _ in drifted)
        print(f"{'UPDATED' if a.write else 'DRIFT'}: {names}")
        return 0 if a.write else 1
    print("Everything in sync.")
    return 0


sys.exit(main())
