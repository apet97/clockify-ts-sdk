# Gates: coverage, mutation, performance, determinism

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- **Comments ship in `dist`, so documentation moves `size-run`.** `size-limit`
  measures the emitted bundle, and several wrapper subpaths are two-thirds
  comment — `webhooks`, `webhook-events` and `ensure` each needed a ceiling
  raise on 2026-08-07 for prose alone. `size-run` is `perfect-full`-only, so a
  doc-only commit can red an aggregate nothing else runs. Raise a ceiling with
  the reason written down; if it keeps happening, the honest question is
  whether the gate should measure comment-stripped output.
- **An equivalent mutant is killed by proving it, not by lowering the floor.**
  `docs/mutation-score-contract.json` ratchets monotonic-up, so a floor can
  never come down. When a real fix adds a guard no test can distinguish from
  its mutant — a partition relabelled, or a defensive branch nothing can reach
  — mark it `// Stryker disable next-line` with the argument in the comment.
  That removes a dead denominator; lowering the floor would hide the next real
  regression.
- `make changelog-drift` checks that touched package scopes update
  their package changelog.
- `make performance-budgets` checks built package file-size and
  startup/import budgets after package build gates. Budgets are
  marked `calibrated` in `docs/performance-budgets.json`. File-size
  ceilings are intentionally tight against current built artifacts
  (the MCP stdio entrypoint is capped at 1250 bytes); startup-time
  ceilings carry more headroom on purpose because shared CI runners
  show meaningful per-run variance. Recalibrate with
  `make performance-receipt` after material runtime changes.
- `make cassettes` replays committed, redacted response cassettes
  through the typed SDK client and local mock server.
- **NEVER run Stryker locally — mutation proof is GitHub-only.** Do not run
  `make mutation`, `npm run mutation -w <pkg>`, or `npx stryker`. Measure via the
  manual **Mutation** workflow (`workflow_dispatch`, target `wrapper`/`mcp`/`cli`);
  `make mutation-ci` verifies that wiring offline and is the only mutation gate in
  `perfect-full`. A local run costs ~30+ min, pins two cores, and its
  `wrapper/reports/mutation/mutation.json` is what `check-mutation-score.mjs`
  reads — so a stale or partial local report yields a *wrong* score, not a
  missing one. To prove a single mutant flips, apply it by hand (sed the source),
  run that one test, revert.
- Stryker governs the hand-written wrapper helpers, the MCP safety-critical
  modules (`mcp/src/orchestration/confirmation.ts`, `mcp/src/result.ts`,
  `mcp/src/tool-risk.ts`, plus `mcp/src/arg-shapes.ts` 95 and
  `mcp/src/scope-filter.ts` 100, both added 2026-07-29), and the CLI
  command-risk/reference-resolution/receipt modules against
  `docs/mutation-score-contract.json`. Floors ratchet monotonic-up; every
  governed source carries a per-module floor and all three packages carry
  measured global floors — wrapper 82, mcp 85, cli 96 (CLI modules
  `leaf-command.ts` 95, `resolve-refs.ts` 95, `receipt.ts` 100).
  `wrapper/errors.ts` ratcheted 80 -> 93 on 2026-07-30 (measured 93.28); its 26
  remaining survivors are equivalents (V8 already hides Error-subclass ctor
  frames, so the `captureStackTrace` guard mutants are unkillable) — do not
  chase 93+ with new tests.
  The CLI's first-calibration `globalCalibrationPending`/`calibrationPending`
  fields were removed once measured floors landed, and
  `scripts/lib/mutation-score-contract.test.mjs` now **rejects** their
  reintroduction and any zero CLI module floor — do not reinstate them.
- **Adding a module to a `mutate` list is a two-step, GitHub-gated change.**
  `check-mutation-score.mjs` requires an exact one-to-one mapping between active
  mutate sources and `moduleFloors`, so adding a source without a floor reds
  `mutation-ci` (and therefore CI). Dispatch the Mutation workflow first, then
  commit the *measured* floor. Never guess a floor: too high reds, too low
  silently weakens the gate. `wrapper/internal/routing.ts` (88) and
  `wrapper/internal/subdomain-label.ts` (80) joined the mutate list on
  2026-07-29 alongside their sibling `internal/authenticated-boundary-fetch.ts`
  (90; ratcheted from the 87 first-calibration on 2026-07-30), so all three
  host-selection modules are now governed.
  `wrapper/internal/host-env.ts` was considered on 2026-08-05 and **declined**.
  It is three pure accessors over `process` whose only branches are
  host-absence fallbacks (`?.` / `?? {}`). It carries no security decision, and
  its one consumer that does — `create-client.ts` — is governed itself, so a
  broken read surfaces there. The mutate list is a curated safety-critical
  subset, not a coverage aspiration: 22 of 34 hand-written wrapper modules are
  deliberately outside it.
  `subdomain-label.ts` sits at its achievable ceiling: 8 of its 40 mutants are
  equivalent (guards that `SUBDOMAIN_LABEL_RE` already enforces), so the only
  way past 80 is a source change, not a test.
- **Coverage floors re-baseline only via a commit.**
  `scripts/check-coverage-floor.mjs` reads the prior floor from
  `git show HEAD:docs/coverage-contract.json` and rejects any downward move, so a
  sanctioned re-pin (e.g. a vitest-major bump's stricter AST-aware counting) reds
  `make coverage` until it is committed — after which the monotonic ratchet
  resumes from the new floors. Lower a floor only after a real measurement change,
  in BOTH the package `vitest.config.ts` AND `docs/coverage-contract.json`.
  Current branch floors: wrapper 83, cli 80, mcp 72 (raised from 69 on
  2026-07-29). The contract's stated policy is "measured baseline **minus a small
  margin**" (~2pp), so do not re-pin a floor to the exact measurement.
- **A `x !== undefined ? {x} : {}` mapper is a coverage/mutation trap.** The MCP
  report tools map 25+ optional fields that way, and every test passed only the
  required core — so only the `undefined` side was ever exercised and a mapper
  that silently dropped a field would have passed the whole suite. That is the
  same shape as the `--public` no-op. When you add one, test it with the field
  **populated**, asserting the value reaches the request body.
- `make build-determinism` builds the wrapper twice and hashes
  `wrapper/dist/**`; it is wired into `perfect-full`, not
  `perfect-fast`.
