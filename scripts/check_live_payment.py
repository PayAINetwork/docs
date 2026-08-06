#!/usr/bin/env python3
"""End-to-end proof that the documented examples actually take a payment.

Boots the *server* example straight off the Express page, then runs the
*client* example straight off the Fetch page against it, and asserts a real
settlement through the PayAI facilitator. The docs validate each other: if
either page is wrong, this fails.

Compiling proves the code is well-formed. This proves it works.

Requires funded testnet wallets:

    EVM_PRIVATE_KEY   Base Sepolia, holding a little test USDC
    SVM_PRIVATE_KEY   Solana devnet, holding a little test USDC
    EVM_ADDRESS       payee (may be the payer's own address)
    SVM_ADDRESS       payee (may be the payer's own address)

Pointing the payee at the payer's own address makes each run close to free —
the value round-trips and the facilitator sponsors gas.

Skips with exit 0 when the keys are absent, so the job is safe to leave in a
pipeline before secrets are provisioned. Pass --require to make absence fatal.
"""
import json, os, pathlib, re, shutil, signal, subprocess, sys, tempfile, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("DOCS_TEST_PORT", "4123"))

SERVER_PAGE = "x402/servers/typescript/express.mdx"
CLIENT_PAGE = "x402/clients/typescript/fetch.mdx"
NEEDED = ("EVM_PRIVATE_KEY", "SVM_PRIVATE_KEY", "EVM_ADDRESS", "SVM_ADDRESS")


def blocks(page, lang="ts"):
    return re.findall(r"```" + lang + r"\n(.*?)```", (ROOT / page).read_text(), re.S)


def installs(page):
    out = []
    for b in re.findall(r"```bash\n(.*?)```", (ROOT / page).read_text(), re.S):
        out += [l.strip() for l in b.splitlines() if l.strip().startswith("npm install")]
    return out


def sh(cmd, cwd, **kw):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True, **kw)


def prepare(page, d, extra_env):
    d.mkdir(parents=True, exist_ok=True)
    code = max(blocks(page), key=len).replace("4021", str(PORT))
    (d / "index.ts").write_text(code)
    sh("npm init -y && npm pkg set type=module", d)
    for line in installs(page):
        r = sh(line, d)
        if r.returncode:
            raise RuntimeError(f"{page}: install failed: {line}\n{r.stderr[-300:]}")
    sh("npm install -D tsx", d)
    (d / ".env").write_text("\n".join(f"{k}={v}" for k, v in extra_env.items()) + "\n")
    return d


def main():
    require = "--require" in sys.argv
    missing = [k for k in NEEDED if not os.environ.get(k)]
    if missing:
        msg = f"live payment check skipped — missing {', '.join(missing)}"
        print(("ERROR: " if require else "SKIP: ") + msg)
        return 1 if require else 0

    work = pathlib.Path(tempfile.mkdtemp(prefix="live-pay-"))
    proc = None
    try:
        print(f"→ building server from {SERVER_PAGE}")
        srv = prepare(SERVER_PAGE, work / "server", {
            "EVM_ADDRESS": os.environ["EVM_ADDRESS"],
            "SVM_ADDRESS": os.environ["SVM_ADDRESS"],
        })
        print(f"→ building client from {CLIENT_PAGE}")
        cli = prepare(CLIENT_PAGE, work / "client", {
            "EVM_PRIVATE_KEY": os.environ["EVM_PRIVATE_KEY"],
            "SVM_PRIVATE_KEY": os.environ["SVM_PRIVATE_KEY"],
            "RESOURCE_SERVER_URL": f"http://localhost:{PORT}",
            "ENDPOINT_PATH": "/weather",
        })

        print(f"→ starting documented server on :{PORT}")
        proc = subprocess.Popen("npx tsx index.ts", cwd=srv, shell=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, preexec_fn=os.setsid)
        url = f"http://localhost:{PORT}/weather"
        for _ in range(45):
            time.sleep(1)
            try:
                urllib.request.urlopen(url, timeout=3)
            except urllib.error.HTTPError as e:
                if e.code == 402:
                    print("   server is up and returning 402")
                    break
            except Exception:
                continue
        else:
            raise RuntimeError("server never returned a 402")

        print("→ running documented client (real payment through PayAI facilitator)")
        r = sh("npx tsx index.ts", cli, timeout=300)
        out = (r.stdout or "") + (r.stderr or "")
        print("\n".join("   " + l for l in out.strip().splitlines()[-25:]))

        # The client exits 0 even when payment fails, and prints its result via
        # console.dir. Assert on the result itself, not on the exit code.
        #
        # Unpaid looks like:
        #   { status: 402, paymentStatus: 'payment_required',
        #     body: {}, header: { error: 'invalid_exact_evm_insufficient_balance', ... } }
        #
        # Do not match on the resource body text: the bazaar discovery block
        # declares an output example containing the same words, so "sunny"
        # appears even on a 402.
        if r.returncode != 0:
            raise RuntimeError("client exited non-zero")
        if "payment_required" in out:
            raise RuntimeError("server still demanded payment — nothing settled")
        if "insufficient_balance" in out:
            raise RuntimeError("payer wallet is not funded — top up the CI testnet wallets")
        if "status: 402" in out:
            raise RuntimeError("client received a 402 — payment did not complete")
        if "status: 200" not in out:
            raise RuntimeError("client never saw a 200 — the paid resource was not served")

        print("\n✓ live payment settled: the documented client paid the documented server "
              "through the PayAI facilitator and received the protected resource.")
        return 0
    except Exception as e:
        print(f"\n✗ live payment check failed: {e}")
        if proc and proc.poll() is None:
            pass
        return 1
    finally:
        if proc and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except Exception:
                proc.terminate()
        shutil.rmtree(work, ignore_errors=True)


sys.exit(main())
