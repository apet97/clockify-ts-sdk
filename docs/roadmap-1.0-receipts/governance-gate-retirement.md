# Receipt: retirement of the completed 1.0-campaign gates (2026-08-09)

The 1.0 roadmap campaign closed with all 27 tasks done. Three gates then
continued to re-validate that immutable, completed history on every CI
push:

- `unique-claim-inventory` — claim-set equality over the closed campaign
  claim map (`docs/unique-claim-inventory.json`).
- the one-point-zero inventory check inside `release-readiness`
  (`scripts/generate-one-point-zero-inventory.mjs --check`).
- the plan-lifecycle half of `scripts/check-agent-handoff.mjs` —
  git archaeology over the recorded closeout commit and terminology
  markers for the closed lifecycle.

## Final validating run

All three passed on `main` at commit `adae4d8` (merge of PR #79,
CI green on 2026-08-09) — the last commit before this retirement. That
run is the final proof; the history it proved cannot change, so re-proof
adds no protection.

## What is retained

- `docs/plan-lifecycle-contract.json`, `docs/roadmap-1.0-status.json`,
  `docs/unique-claim-inventory.json`, `docs/roadmap-1.0.md`, and the
  policy docs stay in the repo as read-only campaign evidence.
- The guidance-parity half of `agent-handoff` stays live — it guards
  current agent guidance, not campaign history.
- The live-source overlap (risk claims, workflow claims) is already
  covered by `check-risk-register.mjs` and the product-surface drift
  gates.

## What guards the retirement

`scripts/check-agent-handoff.retired-lifecycle.test.mjs` fails if the
retired checkers reappear, if the Makefile rewires them, or if the
campaign evidence docs are deleted.
