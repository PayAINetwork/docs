#!/usr/bin/env python3
"""Compile the code blocks in the docs, following each page's own install steps.

For every page in MANIFEST this script:
  1. extracts the page's own install commands from its bash blocks
  2. extracts its code blocks into the files the page says they are
  3. installs exactly what the page tells the reader to install
  4. compiles / checks the result with that language's toolchain

That means CI validates the page as a reader experiences it: follow the
instructions, get code that works. A page whose install line omits something its
code imports fails here, as does a page whose blocks don't agree with each other.

Per language:
  typescript  npm install ... ; tsc --noEmit
  go          go mod init / go get ... ; go build ./...
  python      pip install ... ; compile the source, then resolve every import

Python has no type checker in the same sense, so the meaningful check is that the
source parses and every module it imports actually resolves in the environment
the page told you to create. That is the failure this catches in practice: the
install line and the imports drifting apart.

Usage:
    python3 scripts/check-examples.py            # all pages
    python3 scripts/check-examples.py express    # one page by key
"""
import ast, json, os, re, shutil, subprocess, sys, tempfile, textwrap, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

MANIFEST = {
    # ---- TypeScript -------------------------------------------------------
    "express": dict(page="x402/servers/typescript/express.mdx", lang="ts",
                    files={0: "index.ts"}),
    "hono":    dict(page="x402/servers/typescript/hono.mdx", lang="ts",
                    files={0: "index.ts"}),
    "fetch":   dict(page="x402/clients/typescript/fetch.mdx", lang="ts",
                    files={0: "index.ts"}),
    "axios":   dict(page="x402/clients/typescript/axios.mdx", lang="ts",
                    files={0: "index.ts"}),
    "nextjs":  dict(page="x402/servers/typescript/nextjs.mdx", lang="typescript",
                    files={0: "proxy.ts", 1: "app/api/weather/route.ts"},
                    # Step 1 scaffolds with create-next-app, so the framework
                    # packages never appear in an install line on the page.
                    extra_deps=["next", "react", "react-dom"],
                    extra_dev_deps=["@types/react"]),
    # ---- Python -----------------------------------------------------------
    "fastapi":  dict(page="x402/servers/python/fastapi.mdx", lang="python",
                     files={0: "main.py"}),
    "flask":    dict(page="x402/servers/python/flask.mdx", lang="python",
                     files={0: "main.py"}),
    "httpx":    dict(page="x402/clients/python/httpx.mdx", lang="python",
                     files={0: "main.py"}),
    "requests": dict(page="x402/clients/python/requests.mdx", lang="python",
                     files={0: "main.py"}),
    # ---- Go ---------------------------------------------------------------
    "gin":     dict(page="x402/servers/go/gin.mdx", lang="go",
                    files={0: "main.go"}),
    "go-http": dict(page="x402/clients/go/http.mdx", lang="go",
                    files={0: "main.go"}),
}

TSCONFIG = {"compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "jsx": "preserve", "strict": False, "noEmit": True, "skipLibCheck": True}}

# Modules that ship with the interpreter and so need not appear in the page's
# install line. sys.stdlib_module_names is 3.10+; fall back for older runners.
PY_STDLIB_OK = set(getattr(sys, "stdlib_module_names", ())) | {
    "__future__", "abc", "asyncio", "base64", "collections", "contextlib",
    "dataclasses", "datetime", "decimal", "enum", "functools", "hashlib", "hmac",
    "http", "io", "itertools", "json", "logging", "math", "os", "pathlib",
    "random", "re", "secrets", "socket", "string", "struct", "subprocess", "sys",
    "textwrap", "threading", "time", "typing", "urllib", "uuid", "warnings",
}


def blocks(text, lang):
    """Code blocks for a language, dedented (they are indented inside <Tab>)."""
    return [textwrap.dedent(b) for b in
            re.findall(r"```" + lang + r"\n(.*?)```", text, re.S)]


def install_cmds(text, prefixes):
    out = []
    for b in re.findall(r"```bash\n(.*?)```", text, re.S):
        for line in textwrap.dedent(b).splitlines():
            line = line.strip()
            if line.startswith(prefixes):
                out.append(line)
    return out


def run(cmd, cwd, env=None):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True,
                          text=True, env=env)


# --------------------------------------------------------------------------- ts
def check_ts(cfg, text, d):
    installs = install_cmds(text, ("npm install",))
    if not installs:
        return False, "no `npm install` line found on the page"
    (d / "tsconfig.json").write_text(json.dumps(TSCONFIG, indent=2))
    if (r := run("npm init -y && npm pkg set type=module", d)).returncode:
        return False, f"npm init failed: {r.stderr[-300:]}"
    for line in installs:
        if (r := run(line, d)).returncode:
            return False, f"page's own install failed: `{line}`\n{r.stderr[-400:]}"
    if extra := cfg.get("extra_deps"):
        if (r := run("npm install " + " ".join(extra), d)).returncode:
            return False, f"scaffold deps failed: {r.stderr[-300:]}"
    dev = ["typescript", "@types/node"] + cfg.get("extra_dev_deps", [])
    if (r := run("npm install -D " + " ".join(dev), d)).returncode:
        return False, f"dev deps failed: {r.stderr[-300:]}"
    if (r := run("npx tsc --noEmit", d)).returncode:
        return False, "tsc reported errors:\n" + (r.stdout or r.stderr).strip()
    return True, "compiles clean" + versions_note(d, ("@x402/core", "@payai/facilitator"))


def versions_note(d, pkgs):
    got = []
    for p in pkgs:
        pj = d / "node_modules" / p / "package.json"
        if pj.exists():
            got.append(f"{p}@{json.loads(pj.read_text())['version']}")
    return f" against {', '.join(got)}" if got else ""


# ----------------------------------------------------------------------- python
def python_bin():
    """An interpreter new enough for the packages the pages install.

    Not sys.executable: the script may well be run by an older default python
    (macOS still ships 3.9), while `x402` on PyPI requires >=3.10. Using the
    running interpreter makes the check fail for a reason that has nothing to do
    with the docs.
    """
    if env := os.environ.get("PYTHON_BIN"):
        return env
    for cand in ("python3.13", "python3.12", "python3.11", "python3.10"):
        if shutil.which(cand):
            return cand
    return sys.executable


def check_python(cfg, text, d):
    installs = install_cmds(text, ("pip install", "uv pip install"))
    if not installs:
        return False, "no `pip install` line found on the page"
    interp = python_bin()
    ver = run(f"{interp} -c 'import sys;print(\"%d.%d\"%sys.version_info[:2])'", d).stdout.strip()
    if tuple(int(x) for x in ver.split(".")) < (3, 10):
        return False, (f"need Python >=3.10 to install these packages, found {ver} "
                       f"({interp}). Set PYTHON_BIN to a newer interpreter.")
    venv = d / ".venv"
    if (r := run(f"{interp} -m venv {venv}", d)).returncode:
        return False, f"venv failed: {r.stderr[-300:]}"
    py = venv / "bin" / "python"
    run(f"{py} -m pip install --quiet --upgrade pip", d)
    for line in installs:
        cmd = line.replace("pip install", f"{py} -m pip install --quiet", 1)
        if (r := run(cmd, d)).returncode:
            return False, f"page's own install failed: `{line}`\n{r.stderr[-400:]}"

    src_path = d / list(cfg["files"].values())[0]
    src = src_path.read_text()
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        return False, f"source does not parse: line {e.lineno}: {e.msg}"

    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])
    third_party = sorted(imported - PY_STDLIB_OK)

    probe = ("import importlib.util,sys;"
             "missing=[m for m in sys.argv[1:] if importlib.util.find_spec(m) is None];"
             "print(','.join(missing))")
    r = run(f"{py} -c {json.dumps(probe)} {' '.join(third_party)}", d)
    missing = [m for m in (r.stdout or "").strip().split(",") if m]
    if missing:
        return False, (f"code imports {', '.join(missing)} but the page's install "
                       f"line does not provide it")
    show = run(f"{py} -m pip show x402", d).stdout
    v = next((l.split(": ", 1)[1].strip() for l in show.splitlines()
              if l.startswith("Version:")), None)
    return True, (f"parses; all {len(third_party)} third-party imports resolve"
                  + (f" against x402=={v}" if v else "") + f" [py{ver}]")


# --------------------------------------------------------------------------- go
def check_go(cfg, text, d):
    cmds = install_cmds(text, ("go mod init", "go get", "go mod tidy"))
    if not cmds:
        return False, "no `go mod` / `go get` lines found on the page"
    env = {**os.environ, "GOFLAGS": "-mod=mod", "GOTOOLCHAIN": "auto"}
    for line in cmds:
        if (r := run(line, d, env=env)).returncode:
            return False, f"page's own setup failed: `{line}`\n{r.stderr[-500:]}"
    if (r := run("go build ./...", d, env=env)).returncode:
        return False, "go build reported errors:\n" + (r.stderr or r.stdout).strip()[:1200]
    mods = run("go list -m all", d, env=env).stdout
    v = next((l for l in mods.splitlines() if "x402-foundation/x402" in l), "")
    return True, "builds clean" + (f" against {v.strip()}" if v else "")


CHECKERS = {"ts": check_ts, "typescript": check_ts, "python": check_python, "go": check_go}


def check(key, cfg, workdir):
    text = (ROOT / cfg["page"]).read_text()
    lang = cfg["lang"]
    bs = blocks(text, lang)
    need = max(cfg["files"]) + 1
    if len(bs) < need:
        return False, f"expected >= {need} ```{lang} block(s), found {len(bs)}"

    d = workdir / key
    d.mkdir(parents=True)
    for idx, rel in cfg["files"].items():
        f = d / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(bs[idx])
    return CHECKERS[lang](cfg, text, d)


def main():
    keys = sys.argv[1:] or list(MANIFEST)
    if unknown := [k for k in keys if k not in MANIFEST]:
        print(f"unknown page(s): {', '.join(unknown)}\nknown: {', '.join(MANIFEST)}")
        return 2

    workdir = pathlib.Path(tempfile.mkdtemp(prefix="docs-examples-"))
    failures = []
    try:
        for key in keys:
            cfg = MANIFEST[key]
            print(f"→ {key} [{cfg['lang']}] ({cfg['page']})", flush=True)
            ok, msg = check(key, cfg, workdir)
            print(("   ✓ " if ok else "   ✗ ") + msg + "\n", flush=True)
            if not ok:
                failures.append(key)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    if failures:
        print(f"FAILED: {', '.join(failures)}")
        return 1
    print(f"All {len(keys)} example(s) check out.")
    return 0


sys.exit(main())
