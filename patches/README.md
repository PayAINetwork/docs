# PayAI deltas

Each `.patch` here is the difference between an upstream x402 example and the
version this site publishes. Syncing is:

```
upstream example  +  patches/<key>.patch  =  the code block on the page
```

An empty patch means the page is a pure upstream mirror with nothing
PayAI-specific in it — that is currently true of the client examples, because a
buyer talks to no facilitator.

| patch | page | what the delta does |
|---|---|---|
| `express.patch` | `x402/servers/typescript/express.mdx` | facilitator swap + bazaar discovery |
| `hono.patch` | `x402/servers/typescript/hono.mdx` | facilitator swap + bazaar discovery |
| `fetch.patch` | `x402/clients/typescript/fetch.mdx` | *(empty — pure mirror)* |
| `axios.patch` | `x402/clients/typescript/axios.mdx` | *(empty — pure mirror)* |
| `fastapi.patch` | `x402/servers/python/fastapi.mdx` | small prose/wiring edits |
| `flask.patch` | `x402/servers/python/flask.mdx` | *(empty — pure mirror)* |
| `httpx.patch` | `x402/clients/python/httpx.mdx` | condensed from upstream |
| `requests.patch` | `x402/clients/python/requests.mdx` | condensed from upstream |
| `gin.patch` | `x402/servers/go/gin.mdx` | condensed from upstream |

**Python and Go carry the delta differently.** There is no `@payai/*` package to
import, so the PayAI-ness lives in the page's `.env` block as
`FACILITATOR_URL=https://facilitator.payai.network` rather than in the code. That
is why `flask.patch` is empty despite the page being PayAI-specific — and why
`check_deltas.py` scopes those rules to the whole page instead of the code block.

It also means the failure mode is quiet: the upstream `fastapi` and `flask` code
falls back to `https://x402.org/facilitator` when `FACILITATOR_URL` is unset, so
losing that env line points readers at someone else's facilitator without
anything breaking.

## Deliberately not synced

| page | why |
|---|---|
| `x402/clients/go/http.mdx` | upstream splits this across `main.go`, `builder_pattern.go` and `utils.go`; our page condenses it into one block. The diff is **151%** of the page, so it is an adaptation, not a mirror. |
| `x402/servers/typescript/nextjs.mdx` | two code blocks from two upstream files; the sync assumes one block per page. |

Both are still covered by `check-examples.py`, so they cannot silently stop
compiling — they just are not auto-updated.

## If you hand-edit an example

**Regenerate the patch, or the next weekly sync will revert your change.**

The sync has no way to tell "upstream moved" apart from "a human edited the
page" — both look like the page disagreeing with `upstream + patch`. So after
editing a code block on a covered page:

```bash
python3 scripts/sync_upstream.py --regen <key>
```

and commit the updated patch alongside the page. Running `--regen` with no key
rebuilds all of them.

## Everyday commands

```bash
python3 scripts/sync_upstream.py --check    # is anything behind upstream?
python3 scripts/sync_upstream.py --write    # pull upstream changes into the pages
python3 scripts/sync_upstream.py --regen    # rebuild patches from the pages as they are
```

## When a patch stops applying

The sync exits 2 and opens an issue rather than guessing. That means upstream
restructured the example around the lines we patch, so the delta needs a human
decision: reapply it differently, or change our guidance to match. Regenerate
the patch once you have decided.

## Adding a page

Add an entry to `PAGES` in `scripts/sync_upstream.py`, run `--regen <key>`, and
add matching entries to `scripts/check-examples.py` (so it compiles) and
`scripts/check_deltas.py` (so its PayAI-specific parts are asserted).

Not yet covered, in rough order of ease: the Next.js page (two files rather than
one), the Python pages (fastapi, flask, httpx, requests), and the Go pages (gin,
net/http). All of them are single complete blocks with their own install
command, so they slot into the same shape.
