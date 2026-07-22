# Task 18 — aggregate GitHub-only mutation proof

## Authority and boundary

The authoritative proof is the manual GitHub Actions **Mutation** workflow
with `target=all`, not any of the earlier package-specific calibration or
floor-bearing runs. The canonical evidence below is byte-for-byte checked against
the machine-readable proof record; it is the only location in this receipt that
states run, artifact, hash, score, or no-local-mutation values.

<!-- task18-canonical-evidence:start -->
## Canonical live evidence

- Proof commit: `1f3e4de98ebd6445dde5280c23ce825f0719cfb3`
- Workflow: `.github/workflows/mutation.yml` (`Mutation`, `workflow_dispatch`)
- Run: [29914969280](https://github.com/apet97/clockify-ts-sdk/actions/runs/29914969280), attempt `1`, target `all`, conclusion `success`
- Aggregate job: `88906585019`, `Stryker mutation (all)`, attempt `1`, conclusion `success`
- Run timestamps: created `2026-07-22T11:14:45Z`; started `2026-07-22T11:14:45Z`; completed `2026-07-22T12:02:19Z`
- Artifact: `8528690403`, `mutation-reports-all-1`, 247,047 bytes
- Artifact state: created `2026-07-22T12:02:15Z`; expires `2026-08-05T12:02:14Z`; expired `false` at verification
- Archive SHA-256: `877a785c5f79a57e9449315dc527f0336d3198d898c4acf078f3463903e864ae`
- Verified at: `2026-07-22T12:03:07Z`
- Canonical no-local-mutation assertion: `true`.

### Report SHA-256

| Report path | SHA-256 |
|---|---|
| `wrapper/reports/mutation/mutation.json` | `aa7522e2ac00296dbe61ffa3b11361c6b0b6c14dd63725d796043eb3e393a418` |
| `mcp/reports/mutation/mutation.json` | `a13c0d015e1ad0f64852e8c99b9ff8528e748ed4aa6a3c8f7ab2571643424bcf` |
| `cli/reports/mutation/mutation.json` | `4dc192a3accc90c7d0eb58efea2edfb8b1a3ac8966641a3a96c5c861d0c5bb9d` |

### Scores

| Package | Global score | Floor |
|---|---:|---:|
| wrapper | 86.31067961165049 | 82 |
| mcp | 85.76388888888889 | 85 |
| cli | 96.03174603174604 | 96 |

### Governed module scores/floors

#### wrapper
- `wrapper/composed-fetch.ts`: 85.82089552238806/82
- `wrapper/create-client.ts`: 67.52136752136752/67
- `wrapper/dates.ts`: 88.92215568862275/88
- `wrapper/errors.ts`: 82.38341968911917/80
- `wrapper/ensure.ts`: 94.5945945945946/94
- `wrapper/internal/authenticated-boundary-fetch.ts`: 88.77551020408163/87
- `wrapper/invoice-body.ts`: 93.37748344370861/93
- `wrapper/iter.ts`: 100/95
- `wrapper/money.ts`: 100/98
- `wrapper/webhook-url.ts`: 85.995085995086/83

#### mcp
- `mcp/src/orchestration/confirmation.ts`: 86.36363636363636/86
- `mcp/src/result.ts`: 85/85
- `mcp/src/tool-risk.ts`: 90/90

#### cli
- `cli/src/commands/leaf-command.ts`: 95.91836734693878/95
- `cli/src/commands/resolve-refs.ts`: 95/95
- `cli/src/receipt.ts`: 100/100

<!-- task18-canonical-evidence:end -->

The safe live-only invocation was:

```bash
GITHUB_TOKEN="$(gh auth token)" node scripts/verify-remote-mutation-proof.mjs
```

`GITHUB_TOKEN` is supplied only through the child process's ephemeral process environment.
The verifier does not print or persist the token; do not export it or write it to a file.

The canonical machine-readable record is
[`remote-mutation-proof-contract.json`](../remote-mutation-proof-contract.json).

## Deterministic gates and status

- `make mutation-ci` passed with fixture-only remote-proof checks; it did not
  contact GitHub or execute Stryker.
- `make risk-register risk-status-report release-readiness` passed after the
  accepted non-blocking risk state was recorded.
- `node scripts/repo-doctor.mjs` and `git diff --check` passed.

`remote-mutation-proof-pending` is accepted and non-blocking. This does not
make a release decision, does not publish/tag/push anything, does not close Task
1 or the roadmap, and does not close Task 18: Task 18 remains
`implemented-awaiting-independent-approvals` at `0/2` approvals.

Natural artifact expiry does not retroactively invalidate this sanitized,
live-verified record. A future decision that needs a fresh download must dispatch
and verify a new aggregate run.
