#!/usr/bin/env python3
"""Prove the documented PayAI auth provider works against the live facilitator.

Boots the FastAPI server example straight off the docs page, wired to the
PayAI auth provider from that same page's production section, then pays it with
the documented Fetch client. If the payment settles, the merchant authenticated
successfully.

Why it is shaped this way. Probing /verify directly does not work: the
facilitator validates the request body before the token, so a request with a
bogus body returns the same 400 whether the Authorization header is absent,
malformed, or a well-formed unsigned token. And unauthenticated requests succeed
anyway on the free tier, so "did not 401" proves nothing. A settled payment
through a server configured with the provider is the signal that actually means
the token was accepted.

Requires, in addition to the live-payment wallets:

    PAYAI_API_KEY_ID       merchant API key id
    PAYAI_API_KEY_SECRET   Ed25519 PKCS#8 secret, payai_sk_ prefix optional

Skips with exit 0 when they are absent. Pass --require to make absence fatal.
"""
import os, pathlib, re, shutil, signal, subprocess, sys, tempfile, textwrap, time
import urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("DOCS_AUTH_PORT", "4131"))

SERVER_PAGE = "x402/servers/python/fastapi.mdx"
CLIENT_PAGE = "x402/clients/typescript/fetch.mdx"
NEEDED = ("PAYAI_API_KEY_ID", "PAYAI_API_KEY_SECRET",
          "EVM_PRIVATE_KEY", "SVM_PRIVATE_KEY", "EVM_ADDRESS", "SVM_ADDRESS")


def blocks(page, lang):
    text = (ROOT / page).read_text()
    return [textwrap.dedent(b) for b in
            re.findall(r"```" + lang + r"\n(.*?)```", text, re.S)]


def install_lines(page, prefix):
    out = []
    for b in re.findall(r"```bash\n(.*?)```", (ROOT / page).read_text(), re.S):
        out += [l.strip() for l in textwrap.dedent(b).splitlines()
                if l.strip().startswith(prefix)]
    return out


def sh(cmd, cwd, env=None):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True,
                          text=True, env=env)


def python_bin():
    for c in ("python3.13", "python3.12", "python3.11", "python3.10"):
        if shutil.which(c):
            return c
    return sys.executable


def wire_auth(main_src):
    """Apply the page's own production wiring: pass auth_provider to the client.

    The docs show this as a snippet rather than a second copy of main.py, so the
    substitution here mirrors exactly what a reader is told to change.
    """
    pattern = re.compile(
        r"facilitator\s*=\s*HTTPFacilitatorClient\(\s*FacilitatorConfig\(url=FACILITATOR_URL\)\s*\)")
    replacement = (
        "from payai_auth import PayAIAuthProvider\n"
        "facilitator = HTTPFacilitatorClient(\n"
        "    FacilitatorConfig(\n"
        "        url=FACILITATOR_URL,\n"
        "        auth_provider=PayAIAuthProvider(\n"
        '            os.environ["PAYAI_API_KEY_ID"],\n'
        '            os.environ["PAYAI_API_KEY_SECRET"],\n'
        "        ),\n"
        "    )\n"
        ")")
    new, n = pattern.subn(replacement, main_src, count=1)
    if n != 1:
        raise RuntimeError(
            "could not find the facilitator client construction in the FastAPI "
            "example — the page changed shape and this gate needs updating")
    return new


def main():
    require = "--require" in sys.argv
    missing = [k for k in NEEDED if not os.environ.get(k)]
    if missing:
        msg = f"auth check skipped — missing {', '.join(missing)}"
        print(("ERROR: " if require else "SKIP: ") + msg)
        return 1 if require else 0

    work = pathlib.Path(tempfile.mkdtemp(prefix="auth-live-"))
    proc = None
    try:
        # ---- server: the documented FastAPI example, with auth wired in
        srv = work / "server"; srv.mkdir(parents=True)
        py_blocks = blocks(SERVER_PAGE, "python")
        (srv / "payai_auth.py").write_text(py_blocks[1])
        (srv / "main.py").write_text(wire_auth(py_blocks[0]))
        print(f"→ built server from {SERVER_PAGE} with the auth provider wired")

        interp = python_bin()
        sh(f"{interp} -m venv .venv", srv)
        vpy = srv / ".venv" / "bin" / "python"
        sh(f"{vpy} -m pip install --quiet --upgrade pip", srv)
        for line in install_lines(SERVER_PAGE, "pip install"):
            r = sh(line.replace("pip install", f"{vpy} -m pip install --quiet", 1), srv)
            if r.returncode:
                raise RuntimeError(f"server install failed: {line}\n{r.stderr[-300:]}")

        # ---- client: the documented Fetch example
        cli = work / "client"; cli.mkdir(parents=True)
        (cli / "index.ts").write_text(
            max(blocks(CLIENT_PAGE, "ts"), key=len).replace("4021", str(PORT)))
        sh("npm init -y && npm pkg set type=module", cli)
        for line in install_lines(CLIENT_PAGE, "npm install"):
            if sh(line, cli).returncode:
                raise RuntimeError(f"client install failed: {line}")
        sh("npm install -D tsx", cli)
        (cli / ".env").write_text(
            f"EVM_PRIVATE_KEY={os.environ['EVM_PRIVATE_KEY']}\n"
            f"SVM_PRIVATE_KEY={os.environ['SVM_PRIVATE_KEY']}\n"
            f"RESOURCE_SERVER_URL=http://localhost:{PORT}\n"
            f"ENDPOINT_PATH=/weather\n")

        env = {**os.environ,
               "FACILITATOR_URL": "https://facilitator.payai.network",
               "PORT": str(PORT)}
        print(f"→ starting the authenticated server on :{PORT}")
        proc = subprocess.Popen(
            f"{vpy} -m uvicorn main:app --host 127.0.0.1 --port {PORT}",
            cwd=srv, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, env=env, preexec_fn=os.setsid)

        url = f"http://localhost:{PORT}/weather"
        for _ in range(60):
            time.sleep(1)
            if proc.poll() is not None:
                raise RuntimeError("server exited early:\n" + (proc.stdout.read() or "")[-1500:])
            try:
                urllib.request.urlopen(url, timeout=3)
            except urllib.error.HTTPError as e:
                if e.code == 402:
                    print("   server is up and returning 402 (auth provider active)")
                    break
            except Exception:
                continue
        else:
            raise RuntimeError("server never returned a 402")

        print("→ paying it with the documented Fetch client")
        r = sh("npx tsx index.ts", cli)
        out = (r.stdout or "") + (r.stderr or "")
        print("\n".join("   " + l for l in out.strip().splitlines()[-20:]))

        if "insufficient_balance" in out:
            raise RuntimeError("payer wallet is not funded — top up the CI testnet wallets")
        if "payment_required" in out or "status: 402" in out:
            raise RuntimeError("payment did not settle; the merchant may have failed to authenticate")
        if "status: 200" not in out:
            raise RuntimeError("client never saw a 200")

        print("\n✓ authenticated settlement: the documented FastAPI server signed a "
              "PayAI JWT, the facilitator accepted it, and the payment settled.")
        return 0
    except Exception as e:
        print(f"\n✗ auth check failed: {e}")
        return 1
    finally:
        if proc and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except Exception:
                proc.terminate()
        shutil.rmtree(work, ignore_errors=True)


sys.exit(main())
