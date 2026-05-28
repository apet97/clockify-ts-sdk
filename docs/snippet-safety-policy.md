# Snippet Safety Policy

This policy keeps copied SDK, CLI, MCP, README, and cookbook snippets safe for
non-coder users. A snippet is safe when it uses public package surfaces, avoids
raw secrets, states mock/live boundaries, and produces receipts that can be
triaged without guessing.

## Snippet rules

- SDK snippets import from `clockify-sdk-ts-115` or documented subpaths, never
  from `wrapper/src/**`, `output/ts-sdk/**`, or generated internals.
- CLI snippets use `clk115` or `clockify115`, include `--json` when the output is
  meant for automation, and do not hide destructive writes behind prompts.
- MCP snippets name the exact tool or resource and describe the expected
  `structuredContent` receipt.
- Environment examples show variable names, not real values. Use placeholders
  such as `your_key_here`, `<redacted>`, `workspace_123`, and `entry_123`.
- `CLOCKIFY_BASE_URL` appears only as mock/replay or private test guidance, not
  normal production setup.
- `node scripts/plan.mjs workflow --workflow first-run-support` is a no-network
  support map, not proof. Any snippet that cites it must preserve
  `safeCommandHints`, avoid raw `.env` values and copied logs, and point to the
  real proof gate separately.
- Live snippets must say sacrificial sandbox and cleanup proof when they mutate
  Clockify state.
- Snippets that create, update, delete, invoice, expense, schedule, or request
  time off must mention identifiers, `changed`, or recovery receipts.

## Copy-paste safety checklist

Before adding or changing a snippet, answer these questions:

1. Does it use only public package names or documented CLI/MCP surfaces?
2. Does it avoid raw API keys, addon tokens, npm tokens, cookies, `.env` files,
   and customer data?
3. Does it tell users whether the snippet is deterministic mock/replay,
   read-only live, or live-mutating sandbox proof?
4. Does it show how to inspect the result through JSON, `requestId`,
   `structuredContent`, `changed`, `retryable`, or `recovery`?
5. If it is a first-run support snippet, does it say `safeCommandHints` are a
   safe command map and not proof?
6. Does a matching contract or README table make future drift detectable?

## Allowed placeholders

Use these placeholder shapes consistently:

- `your_key_here` for examples that must show a key position.
- `<redacted>` for support bundles, logs, and copied receipts.
- `workspace_123`, `project_123`, `entry_123`, `tag_123`, and `req_123` for
  sanitized IDs.
- `https://mock.local` or `http://127.0.0.1:<port>` for mock/replay endpoints.

## Forbidden snippet patterns

Placeholder-only secret guidance applies to every copy-paste example: use
placeholder values for credentials, workspace IDs, webhook secrets, and tokens.

- Imports from `../src`, `./src`, `wrapper/src`, or `output/ts-sdk`.
- Unscoped package names like `clockify-sdk-ts` in new copy-paste examples.
- Real-looking bearer tokens, npm tokens, webhook secrets, cookies, or workspace
  IDs copied from live accounts.
- `CLOCKIFY_BASE_URL` without mock/replay/test-only wording nearby.
- Live mutation snippets without sacrificial sandbox and cleanup wording.

## Required receipts

Run or include the relevant checked surface before claiming snippet safety:

- `make examples-contract` for SDK example inventory and import safety.
- `make user-docs` for README and onboarding snippet coverage.
- `make receipt-examples` for output-shape examples.
- `make support-bundle` for redaction and escalation examples.
- `make live-safety` when a snippet mutates live Clockify state.
