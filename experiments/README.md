# experiments/ — Phase 0 generator spike

Throwaway space for evaluating SDK generators against
`spec/corrected/clockify.corrected.openapi.yaml`. Outputs are
gitignored; only this README, the comparison notes (`comparison.md`),
and per-generator log files survive.

## Layout

| Subdir | Generator | How to (re)populate |
|---|---|---|
| `fern/` | Fern (current production) | Symlink → `../output/ts-sdk/`. Refresh via `(cd ../spec/fern && fern generate --group ts --local --force)`. |
| `speakeasy/` | Speakeasy CLI | `speakeasy run` from inside this dir (needs `gen.yaml` + `.speakeasy/workflow.yaml`). |
| `stainless/` | Stainless (SaaS-only) | Upload `spec/corrected/clockify.corrected.openapi.yaml` via [stainless.com](https://stainless.com) portal, download the TS SDK ZIP, extract here. |

## Spike goal

Pick "stay on Fern" vs "migrate generator" with evidence on:

- Method naming (CRUDL vs operationId)
- Auto-pagination for bare-array responses
- Error hierarchy depth
- Retry config customizability
- Observability hooks
- Dual ESM+CJS out-of-the-box
- Supply-chain signing
- License & cost
- Lock-in risk

Result lives at `../spec/evidence/generator-comparison.md`
(canonical comparison artifact) and as a discrepancies entry
`generator.choice.fern-vs-stainless-vs-speakeasy` in
`../spec/evidence/discrepancies.md`. This directory holds only
the spike's working outputs (logs + generator-emitted files);
the conclusions live alongside the rest of the evidence ledger.

## Current state (2026-05-24)

Phase 0 spike complete. Verdict: **stay on Fern**. Speakeasy
halted on `rtl`/`RTL` identifier collision in
`OpenapiInvoiceExportFields`; full details in the canonical
artifact above. Stainless deferred per scope decision.
