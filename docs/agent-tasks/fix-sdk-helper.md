# Agent task: fix an SDK helper

**When to use:** you are changing the behavior of an existing hand-written helper
in `wrapper/` (e.g. `resolve.ts`, `dates.ts`, `money.ts`, `pagination.ts`,
`iter.ts`) **without** adding or renaming a public symbol. If you are adding a new
public name or subpath, use [`update-public-export.md`](./update-public-export.md)
instead.

## Files to read first

- `AGENTS.md` (the canonical contract) and `CLAUDE.md`.
- `wrapper/README.md` — the public surface and helper layers.
- The helper source you are changing, `wrapper/<name>.ts`, and its test
  `wrapper/tests/<name>.test.ts`.
- `docs/sdk-runtime-policy.md` and `docs/receipts-policy.md` if behavior or
  receipts change.

## Files you may edit

- `wrapper/<name>.ts` (the helper).
- `wrapper/tests/<name>.test.ts` (add/extend tests).
- `wrapper/tests/types/*.test-d.ts` if the type surface (not the name set)
  changes.
- `wrapper/CHANGELOG.md` — add an entry under `## [Unreleased]`.

## Files you must NOT edit

- `wrapper/src/**` and `output/ts-sdk/**` — generated SDK (run `make sdk-codegen`).
- `docs/sdk-public-api.json`, `wrapper/scripts/verify-dual-build.sh`,
  `wrapper/package.json` `exports` — only change these when the public **name
  set** changes (that is a different packet).
- `spec/corrected/**`, `spec/official/**`.

## Required tests / gates

```bash
npm run type-check -w clockify-sdk-ts-115
npm test -w clockify-sdk-ts-115
make sdk-public-api      # public surface must be unchanged
make perfect-fast
```

## Required docs / changelog updates

- `wrapper/CHANGELOG.md` `## [Unreleased]` entry (touching `wrapper/` triggers
  `make changelog-drift`).
- Update `wrapper/README.md` prose only if observable behavior changed.

## Completion checklist

- [ ] Helper behavior changed in `wrapper/<name>.ts` only; no `wrapper/src/**` edit.
- [ ] Public name set unchanged (`make sdk-public-api` green).
- [ ] New/updated unit test covers the change.
- [ ] `wrapper/CHANGELOG.md` `## [Unreleased]` updated.
- [ ] `npm run type-check -w clockify-sdk-ts-115` and `npm test -w clockify-sdk-ts-115` pass.
- [ ] `make perfect-fast` passes; output cited.
