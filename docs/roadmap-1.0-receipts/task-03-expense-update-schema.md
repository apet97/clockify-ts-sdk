# Task 3 Receipt — Expense Update Schema

Date: 2026-07-19

## Truth decision

The file is optional for expense update only. The owning GOCLMCP
curated source is `docs/openapi/sources/realOPENAPI/EXPENSESOPEAPI.YAML`; commit
`bf8f72814c6fe7044bd78b86b27674ef1eb2a666` removes `file` only from
`ExpenseUpdateRequest.required`. The canonical expense-create request retains
its exact existing required set: `amount`, `categoryId`, `date`, and `userId`.

The TypeScript snapshot is a byte-for-byte copy of that regenerated canonical
OpenAPI. Local SDK regeneration emits optional `file` fields in both flattened
and body-envelope expense-update request types; no generated file was edited by
hand.

## Consumer and wire proof

- `wrapper/tests/expense-update-multipart.test.ts` compiles and calls the
  generated `expenses.update` method without a file or cast, then proves the
  exact scalar multipart field names and absence of a `file` part.
- The same test supplies a PNG `Blob` and proves one `file` part remains with
  the expected MIME type and bytes.
- CLI and MCP expense updates dispatch the corrected generated request type
  directly. Their former `KEEP as never` annotations and cast-budget exceptions
  are gone; focused tests preserve their scalar request and stored-preview
  behavior.
- Historical discrepancy text remains dated as historical evidence and records
  the 2026-07-19 closure separately.

## Closure proof

Upstream proof:

```text
make gen-openapi
make openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift
go test -count=1 ./tests ./internal/clockify ./internal/tools/...
go test -count=1 ./...
git diff --check
```

Downstream proof:

```text
make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison
npm run type-check -w clockify-sdk-ts-115
npm test -w clockify-sdk-ts-115
npm run build -w clockify-sdk-ts-115
npm run build:smoke -w clockify-sdk-ts-115
npm test -w @apet97/clockify-cli-115 -- tests/read-commands-expenses.test.ts
npm test -w @apet97/clockify-mcp-115 -- tests/expenses.test.ts
npm run type-check -w @apet97/clockify-cli-115
npm run lint -w @apet97/clockify-cli-115
npm run build -w @apet97/clockify-cli-115
npm run type-check -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
npm run build -w @apet97/clockify-mcp-115
make consumer-cast-budget risk-register contract-gates
make pack-snapshot-check
npm pack --dry-run -w clockify-sdk-ts-115
npm pack --dry-run -w @apet97/clockify-cli-115
npm pack --dry-run -w @apet97/clockify-mcp-115
git diff --check
```

No live Clockify mutation, local Stryker/mutation run, tag, package-version
change, publication, release, main integration, or Task 4 work was performed.
