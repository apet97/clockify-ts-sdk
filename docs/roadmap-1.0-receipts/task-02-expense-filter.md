# Task 2 Receipt — Expense Filter Contract

Date: 2026-07-19

## Live decision

An authenticated read-only preflight returned HTTP 200 for both the current-user
and pinned-workspace routes. The expense-list route then returned HTTP 200 for
all of these requests:

| Case | Returned records | `Last-Page` | Same first-page records as baseline |
|---|---:|---|---|
| baseline, page 1, page-size 200 | 200 | `false` | yes |
| start only, date-only future bound | 200 | `false` | yes |
| end only, date-only past bound | 200 | `false` | yes |
| both bounds, date-only future window | 200 | `false` | yes |
| both bounds, ISO-8601 `Z` future window | 200 | `false` | yes |
| both bounds, ISO-8601 offset future window | 200 | `false` | yes |

Page-size 1 pages 1, 2, and 3 returned three distinct records. Page-size 2
pages 1 and 2 returned distinct record sets. This proves the route honors
`page`/`page-size` but ignores `start`/`end`; adding those date parameters to
canonical OpenAPI would be false. Raw bodies and headers remain only in the
gitignored `spec/evidence/probes/20260719-expense-date-filter-contract-*`
directory and contain no committed credentials or customer data.

The server ignores `start`/`end`; the supported contract is bounded
client-side filtering over the typed expense envelope.

## Implemented contract

- `listExpensesFiltered` is the shared SDK helper over the generated, typed
  `{expenses:{expenses:[...]}}` envelope.
- Date-only and ISO-8601 bounds are inclusive and are applied client-side.
- The helper walks bounded pages, honors `Last-Page` when present, continues
  across an empty intermediate page when `Last-Page:false`, and uses a bounded
  page-length fallback when the header is absent.
- Total record limit, page size, start page, maximum pages, warning, and
  continuation metadata are distinct contract fields.
- CLI and MCP both call the helper; neither narrows the list response with an
  ad-hoc response cast or forwards inert date parameters.

## Closure proof

Required focused and aggregate commands:

```text
npm test -w clockify-sdk-ts-115 -- tests/expense-list.test.ts
npm test -w @apet97/clockify-cli-115 -- tests/read-commands-expenses.test.ts
npm test -w @apet97/clockify-mcp-115 -- tests/expenses.test.ts
npm run type-check -w clockify-sdk-ts-115
npm run type-check -w @apet97/clockify-cli-115
npm run type-check -w @apet97/clockify-mcp-115
npm run lint -w clockify-sdk-ts-115
npm run lint -w @apet97/clockify-cli-115
npm run lint -w @apet97/clockify-mcp-115
npm run build -w clockify-sdk-ts-115
npm run build:smoke -w clockify-sdk-ts-115
npm run build -w @apet97/clockify-cli-115
npm run build -w @apet97/clockify-mcp-115
make consumer-cast-budget operation-parity-drift risk-register contract-gates
git diff --check
```

The ignored implementation report at `.superpowers/sdd/task-2-report.md`
records the red/green transcript and exact command results. No local Stryker or
mutation command was run.
