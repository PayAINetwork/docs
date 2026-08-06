#!/usr/bin/env python3
"""Compile the TypeScript code blocks in the docs, following each page's own install steps.

For every page in MANIFEST this script:
  1. extracts the page's ``npm install`` lines from its bash blocks
  2. extracts its TypeScript blocks into the files the page says they are
  3. installs exactly what the page tells the reader to install
  4. runs ``tsc --noEmit`` over the result

That means CI validates the page as a reader experiences it: follow the
instructions, get code that compiles. A page whose install line omits something
its code imports fails here, as does a page whose blocks don't agree with each
other.

Usage:
    python3 scripts/check-examples.py            # all pages
    python3 scripts/check-examples.py express    # one page by key
"""
import json, re, shutil, subprocess, sys, tempfile, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# block_index -> path the page says the block is. Order is the order the ```ts
# blocks appear on the page.
MANIFEST = {
    "express": dict(
        page="x402/servers/typescript/express.mdx",
        files={0: "index.ts"},
    ),
    "hono": dict(
        page="x402/servers/typescript/hono.mdx",
        files={0: "index.ts"},
    ),
    "fetch": dict(
        page="x402/clients/typescript/fetch.mdx",
        files={0: "index.ts"},
    ),
    "axios": dict(
        page="x402/clients/typescript/axios.mdx",
        files={0: "index.ts"},
    ),
    "nextjs": dict(
        page="x402/servers/typescript/nextjs.mdx",
        files={0: "proxy.ts", 1: "app/api/weather/route.ts"},
        # Step 1 scaffolds with create-next-app rather than npm install, so the
        # framework packages never appear in an install line on the page.
        extra_deps=["next", "react", "react-dom"],
        extra_dev_deps=["@types/react"],
        lang="typescript",
    ),
}

TSCONFIG = {
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "jsx": "preserve",
        "strict": False,
        "noEmit": True,
        "skipLibCheck": True,
    }
}


def code_blocks(text, lang):
    return re.findall(r"```" + lang + r"\n(.*?)```", text, re.S)


def install_lines(text):
    """Every `npm install ...` line in the page's bash blocks, in order."""
    out = []
    for block in re.findall(r"```bash\n(.*?)```", text, re.S):
        for line in block.splitlines():
            line = line.strip()
            if line.startswith("npm install"):
                out.append(line)
    return out


def run(cmd, cwd, **kw):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=isinstance(cmd, str), **kw)


def check(key, cfg, workdir):
    page = ROOT / cfg["page"]
    text = page.read_text()
    lang = cfg.get("lang", "ts")

    blocks = code_blocks(text, lang)
    need = max(cfg["files"]) + 1
    if len(blocks) < need:
        return False, f"expected >= {need} ```{lang} block(s), found {len(blocks)}"

    installs = install_lines(text)
    if not installs:
        return False, "no `npm install` line found on the page"

    d = workdir / key
    d.mkdir(parents=True)
    for idx, rel in cfg["files"].items():
        f = d / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(blocks[idx])
    (d / "tsconfig.json").write_text(json.dumps(TSCONFIG, indent=2))

    r = run("npm init -y && npm pkg set type=module", d)
    if r.returncode:
        return False, f"npm init failed: {r.stderr[-300:]}"

    # the page's own install commands, verbatim
    for line in installs:
        r = run(line, d)
        if r.returncode:
            return False, f"page's own install failed: `{line}`\n{r.stderr[-400:]}"

    extra = cfg.get("extra_deps", [])
    if extra:
        r = run("npm install " + " ".join(extra), d)
        if r.returncode:
            return False, f"scaffold deps failed: {r.stderr[-300:]}"

    # tooling the reader gets from their editor / create-next-app
    dev = ["typescript", "@types/node"] + cfg.get("extra_dev_deps", [])
    r = run("npm install -D " + " ".join(dev), d)
    if r.returncode:
        return False, f"dev deps failed: {r.stderr[-300:]}"

    r = run("npx tsc --noEmit", d)
    if r.returncode:
        return False, "tsc reported errors:\n" + (r.stdout or r.stderr).strip()

    versions = []
    for pkg in ("@x402/core", "@payai/facilitator"):
        pj = d / "node_modules" / pkg / "package.json"
        if pj.exists():
            versions.append(f"{pkg}@{json.loads(pj.read_text())['version']}")
    return True, "compiles clean" + (f" against {', '.join(versions)}" if versions else "")


def main():
    keys = sys.argv[1:] or list(MANIFEST)
    unknown = [k for k in keys if k not in MANIFEST]
    if unknown:
        print(f"unknown page(s): {', '.join(unknown)}\nknown: {', '.join(MANIFEST)}")
        return 2

    workdir = pathlib.Path(tempfile.mkdtemp(prefix="docs-examples-"))
    failures = []
    try:
        for key in keys:
            print(f"→ {key} ({MANIFEST[key]['page']})", flush=True)
            ok, msg = check(key, MANIFEST[key], workdir)
            print(("   ✓ " if ok else "   ✗ ") + msg + "\n", flush=True)
            if not ok:
                failures.append(key)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    if failures:
        print(f"FAILED: {', '.join(failures)}")
        return 1
    print(f"All {len(keys)} example(s) compile.")
    return 0


sys.exit(main())
