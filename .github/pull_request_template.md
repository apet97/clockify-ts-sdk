<!--
Thanks for the PR. The full contributor contract lives in
AGENTS.md at the repo root; this template just surfaces the
verify-gates checklist for the specific surface you're touching.
-->

## Summary

<!-- 1-3 sentences. What changed? Why? Link related issues. -->

## Surface

<!-- Tick everything you touched. -->

- [ ] Hand-written wrapper modules (`wrapper/*.ts`)
- [ ] Tests (`wrapper/tests/**`)
- [ ] Build chain (`wrapper/tsconfig.*.json`, `wrapper/package.json`,
      `wrapper/scripts/**`)
- [ ] Examples (`wrapper/examples/**`)
- [ ] Per-resource docs (`wrapper/docs/resources/**` — regenerated
      via `npm run docs:resources`)
- [ ] Spec / OpenAPI snapshot (`spec/corrected/**` — SHOULD NOT
      happen; edits belong in GOCLMCP)
- [ ] CI workflows (`.github/workflows/**`)
- [ ] Governance (`SECURITY.md`, `CONTRIBUTING.md`,
      `.github/ISSUE_TEMPLATE/**`, this template)
- [ ] Discrepancies ledger (`spec/evidence/discrepancies.md`)
- [ ] Top-level docs (`README.md`, `AGENTS.md`, `CLAUDE.md`)

## Verify gates run

<!-- Tick what passed locally. CI re-runs everything. -->

- [ ] `npm run type-check` (clean)
- [ ] `npm run build` (clean — both ESM + CJS pass)
- [ ] `npm run build:smoke` (17 names resolve in each module system)
- [ ] `npm test` (93/93 — or expected count after your changes)
- [ ] `npm pack --dry-run` (no surprise additions)
- [ ] Pack snapshot matches `wrapper/.packsnapshot` (or baseline
      regenerated + committed if intentional)
- [ ] If touched docs: `npm run docs` rebuilds clean
- [ ] If touched per-resource docs: `npm run docs:resources`
      regenerates cleanly + diff committed

## AGENTS.md compliance

<!-- Spot-check the rules most often violated. -->

- [ ] Did NOT edit `wrapper/src/**` (wiped by sync)
- [ ] Did NOT edit `spec/corrected/clockify.corrected.openapi.yaml`
      (frozen snapshot; edits land in GOCLMCP)
- [ ] Did NOT commit raw probe files (`spec/evidence/probes/*.{json,hdr}`)
- [ ] If publish-relevant: ran `npm pack --dry-run` and reviewed
      file list
- [ ] No `it.skip` / `test.skip` / `xit` / `xdescribe` introduced
- [ ] Conventional-commits subject + 72-char wrap

## Discrepancies entry

<!-- If this PR touches behaviour with a known spec/runtime gap,
     link or add the entry in spec/evidence/discrepancies.md. -->

- [ ] N/A (no spec/runtime gap touched)
- [ ] Updated entry: `…`
- [ ] New entry: `…`

## Notes for reviewers

<!-- Anything reviewers should know that isn't obvious from the
     diff. Open questions. Things you tried that didn't work. -->
