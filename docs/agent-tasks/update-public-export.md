# Agent task: add or rename a public SDK export

**When to use:** you are adding a new public symbol or a new subpath to
`clockify-sdk-ts-115` (e.g. a new helper module). The public surface is asserted
exactly, so several files move in lockstep.

## Files to read first

- `AGENTS.md`, `CLAUDE.md`, `wrapper/README.md`.
- `docs/sdk-public-api.json` — `rootSymbols`, `subpaths`, `tsconfigAliases`,
  `packageMarkerScan.paths`.
- `scripts/check-sdk-public-api.mjs` — how the surface is enforced.
- An existing subpath helper to copy (`wrapper/resolve.ts`, `wrapper/money.ts`).
- `wrapper/package.json` `exports`, `wrapper/tsconfig.json`,
  `wrapper/tsconfig.esm.json`, `wrapper/tsconfig.cjs.json`,
  `wrapper/scripts/verify-dual-build.sh`, `docs/package-contract.json`.

## Files you may edit

- New helper `wrapper/<name>.ts` + test `wrapper/tests/<name>.test.ts`.
- `wrapper/index.ts` (re-export block, for a main-entry name).
- `wrapper/package.json` `exports` (new subpath).
- `wrapper/tsconfig.json` (`paths` self-alias + `include`),
  `wrapper/tsconfig.esm.json` + `wrapper/tsconfig.cjs.json` (`include`).
- `wrapper/scripts/verify-dual-build.sh` (SURFACE CSV, `EXPECTED_ROOT_SURFACE_COUNT`,
  a CJS subpath probe block).
- `docs/sdk-public-api.json` (`rootSymbols`, `subpaths`, `tsconfigAliases`,
  `packageMarkerScan.paths`).
- `docs/package-contract.json` (`exportKeys`).
- `wrapper/CHANGELOG.md` (`## [Unreleased]`).
- `wrapper/.packsnapshot` — regenerate after build, do not hand-edit.

## Files you must NOT edit

- `wrapper/src/**`, `output/ts-sdk/**`, `spec/corrected/**`, `spec/official/**`.

## Required tests / gates

```bash
make sdk-codegen                                  # populate wrapper/src if needed
npm run -w clockify-sdk-ts-115 build
npm run -w clockify-sdk-ts-115 build:smoke        # verifies the surface count
node scripts/pack-snapshot.mjs                    # regenerate wrapper/.packsnapshot
make product-surface                              # regenerate product-surface.{json,md}
make sdk-public-api package-contract pack-snapshot-check performance-budgets product-surface-drift changelog-drift
make perfect-fast
```

## Required docs / changelog updates

- `wrapper/CHANGELOG.md` `## [Unreleased]`.
- `wrapper/README.md` subpath prose and the smoke-count line.
- Headline counts: if the public-name or subpath totals change, update them
  everywhere they appear (`README.md`, `wrapper/README.md`, `CLAUDE.md`,
  `AGENTS.md`) and re-run `make docs-counts agent-handoff`. `make sdk-public-api`
  prints the authoritative counts.

## Completion checklist

- [ ] `rootSymbols` count in `docs/sdk-public-api.json` equals
      `EXPECTED_ROOT_SURFACE_COUNT` in `verify-dual-build.sh` and the SURFACE CSV.
- [ ] `package.json` `exports` keys == `sdk-public-api.json` `subpaths` keys ==
      `package-contract.json` `exportKeys`.
- [ ] Built `dist/esm/index.js` / `dist/cjs/index.js` within the
      `performance-budgets.json` ceilings (or helper left subpath-only).
- [ ] `wrapper/.packsnapshot` regenerated from a fresh build.
- [ ] All headline counts updated in prose + `make docs-counts agent-handoff` green.
- [ ] `make perfect-fast` passes; output cited.
