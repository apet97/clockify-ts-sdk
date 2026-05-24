# Contributing to clockify-sdk-ts

Thanks for considering a contribution. This repo is the human
onboarding entry; the **canonical contributor + agent contract is
[AGENTS.md](./AGENTS.md)** — every rule there applies to humans
too. Skim it before opening a non-trivial PR.

## Quick start

```bash
git clone https://github.com/apet97/clockify-ts-sdk.git
cd clockify-ts-sdk/wrapper

npm ci

# Sync the Fern-generated SDK into wrapper/src/. Reads from
# ../output/ts-sdk/, which is the most recent generator output
# committed in this repo.
npm run sync

# Type-check + dual build + verify ESM + CJS surface
npm run type-check
npm run build
npm run build:smoke

# Test (unit tests + live sandbox flows; live ones skip if
# CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID are absent)
npm test
```

For the full build chain (regenerating from the canonical
OpenAPI), see [AGENTS.md §3](./AGENTS.md#3-the-build-chain-top-to-bottom).

## What ships, what doesn't

- ✅ **Hand-written modules** under `wrapper/` root (`index.ts`,
  `create-client.ts`, `composed-fetch.ts`, `iter.ts`, `webhooks.ts`,
  `pagination.ts`) — edit freely; tests in `wrapper/tests/` cover them.
- ❌ **Synced SDK** under `wrapper/src/**` — wiped on every
  `npm run sync`. Don't edit; raise issues with the synced output
  upstream in [Fern](https://github.com/fern-api/fern) or the
  spec-generator at [apet97/go-clockify](https://github.com/apet97/go-clockify).
- ❌ **OpenAPI snapshot** at `spec/corrected/clockify.corrected.openapi.yaml`
  — regenerable; edits land in the upstream sources at
  `../GOCLMCP/docs/openapi/sources/**` or in the generator script.

## Local-API testing

The live test suite in `wrapper/tests/sandbox.test.ts` exercises
5 flows against the real Clockify API. **Never run it against a
production workspace** — CRUD round-trips create + delete real
records.

Set up a sandbox:

```bash
export CLOCKIFY_API_KEY="..."        # from your sandbox workspace
export CLOCKIFY_WORKSPACE_ID="..."   # the sandbox workspace ID
npm test
```

Without these, the live tests skip cleanly and only the 88 unit
tests run.

## Conventions

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`,
`build:`. Subject ≤ 72 chars. Body wrapped at 72.

```
feat(wrapper): add createClockifyClient() factory

The factory hides the addonToken cast workaround...
```

### Pull requests

- Run `npm run type-check && npm run build && npm run build:smoke
  && npm test && npm pack --dry-run` locally before opening a PR.
- Reference the relevant AGENTS.md section in the description.
- For any spec/runtime discrepancy your change touches, add or
  update an entry in
  [`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md)
  using the five-question format.
- The PR template at `.github/pull_request_template.md` has the
  full check-list.

### Code style

- TypeScript strict mode, ES2022 target, NodeNext module resolution.
- 4-space indentation in hand-written modules (matches the synced
  SDK).
- No `console.log` in shipped code. `console.warn` for best-effort
  failures (hook fallbacks). `console.error` only in scripts /
  examples.
- No `it.skip` / `test.skip` / `xit` / `xdescribe` in
  `wrapper/tests/`. Use the env-gated `describe.skip` pattern from
  `tests/sandbox.test.ts` for live tests, but never skip silently.

### Adding a new hand-written module

The exact recipe is in [CLAUDE.md](./CLAUDE.md) under "Where to
look first" → "Add a new hand-written module to the npm surface."
Summary:

1. Drop the `.ts` at `wrapper/` root (outside `src/`).
2. Add it to `tsconfig.json` `include`,
   `tsconfig.esm.json` `include`, `tsconfig.cjs.json` `include`.
3. Add a subpath entry in `package.json` `exports` with both
   `import` and `require` conditions (each with `types` + `default`).
4. Re-export from `wrapper/index.ts` for the one-import-fits-all DX.
5. Add the symbol names to `scripts/verify-dual-build.sh`'s
   `surface` array so the CI smoke catches missing exports.
6. Write tests at `wrapper/tests/<module>.test.ts`.

The twin `tsc` build picks up the new file automatically.

## Reporting bugs / requesting features

Use the issue templates at
`.github/ISSUE_TEMPLATE/`. Form-based — they prompt for the SDK
version, Node version, repro, etc., so we don't have to chase
those down in a follow-up.

For **security** issues, follow [SECURITY.md](./SECURITY.md) —
**not** a public issue.

## Code of Conduct

Be kind. Disagree with code, not people. Assume good faith.
Specific incidents → `petkovic.aleksandar037@gmail.com`.
