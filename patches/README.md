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
