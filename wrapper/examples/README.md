# clockify-sdk-ts-115 examples

Runnable starter scripts for every major SDK surface. Each file
imports from the package via its name (`import { ... } from
"clockify-sdk-ts-115"`) so copy-pasting into a real project requires
no path changes.

## Running locally (from the wrapper/ directory)

```bash
# 1. Build the SDK so self-reference resolves to dist/.
npm run sync && npm run build

# 2. Run an example with tsx (auto-loads TypeScript at runtime).
CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/paginate-all.ts
```

The examples that exercise the live API check for
`CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID` in the environment
and exit cleanly with a message if either is missing.
**Examples that create or delete records do so against your
sandbox workspace — never run them against production data.**

## Catalogue

| Example                                                      | Surface used                                                 | Live API?                        | What it does                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`auth.ts`](./auth.ts)                                       | `createClockifyClient`                                       | no                               | Shows both auth modes (apiKey + addonToken) and the supplier-function pattern for rotating credentials.                                                     |
| [`paginate-all.ts`](./paginate-all.ts)                       | `iterAll`, `iterPages`                                       | yes (read-only)                  | Walks every project in the workspace via `iterAll`; then re-runs via `iterPages` to print per-page progress.                                                |
| [`log-time-entry.ts`](./log-time-entry.ts)                   | `client.timeEntries.*`                                       | yes (write+delete)               | Creates a 1-minute fixed-duration time entry tagged with a timestamp slug, then deletes it.                                                                 |
| [`create-project.ts`](./create-project.ts)                   | `client.projects.*`                                          | yes (write+delete)               | Creates a project, archives it, then deletes it.                                                                                                            |
| [`generate-report.ts`](./generate-report.ts)                 | `client.reports.*`                                           | yes (read-only)                  | Pulls a detailed report for the last 7 days and prints the first 10 entries.                                                                                |
| [`upload-image.ts`](./upload-image.ts)                       | `client.files.uploadImage`                                   | yes (write)                      | Uploads a 1-byte image to exercise the SDK's multipart wire format (no on-disk asset needed).                                                               |
| [`verify-webhook.ts`](./verify-webhook.ts)                   | `verifyClockifyWebhook`, `constructEvent`                    | no                               | Express-style webhook handler showing both verification paths (boolean check + throw-on-mismatch).                                                          |
| [`middleware-datadog.ts`](./middleware-datadog.ts)           | `composedFetch` hooks via `createClockifyClient`             | no                               | Wires `beforeRequest` / `afterResponse` / `onError` / `onRetry` hooks to a Datadog-style metrics+logger sink.                                               |
| [`retry-custom.ts`](./retry-custom.ts)                       | `retryPolicy`                                                | no                               | Custom retry policy with a manual `computeDelay` for full-jitter backoff and a wider retryable-status-code set.                                             |
| [`typed-errors.ts`](./typed-errors.ts)                       | `isClockifyApiError`, `promoteApiError`, `isRateLimitError`  | yes (read-only)                  | Three catch-block styles: outer-edge type guard, promote-then-narrow, and direct type-guard narrowing.                                                      |
| [`structured-logging.ts`](./structured-logging.ts)           | `logging` (ILogger) + `hooks`                                | yes (read-only)                  | Wires the SDK to a Pino-shaped ILogger plus per-stage hooks for structured request/response/error/retry events.                                             |
| [`per-request-overrides.ts`](./per-request-overrides.ts)     | `requestOptions` (timeout, maxRetries, abortSignal, headers) | yes (read+write)                 | Tight timeout, retries off for one call, AbortController cancellation, and a one-off header injection (`Idempotency-Key`).                                  |
| [`idempotency.ts`](./idempotency.ts)                         | `Idempotency-Key` header + `ConflictError`                   | yes (write+delete)               | Demonstrates the Idempotency-Key pattern (Clockify doesn't honor it today; example shows the future-proof shape).                                           |
| [`bulk-archive.ts`](./bulk-archive.ts)                       | `iterAll` + bounded parallelism + `promoteApiError`          | yes (read; write with `--apply`) | Real-world job: walks every project, archives the stale ones with concurrency 4 and per-item error isolation. Dry-run by default; pass `--apply` to mutate. |
| [`pass-idempotency-key.ts`](./pass-idempotency-key.ts)       | `RequestOptions.headers`                                     | yes (write+delete)               | Set an `Idempotency-Key` header on a single write call via Fern's per-call `headers` option.                                                                |
| [`handle-abort.ts`](./handle-abort.ts)                       | `isAbortError`, `promoteApiError`, `AbortController`         | yes (read-only)                  | Catch `ClockifyAbortError` after `controller.abort()`, distinguishing from server-side timeouts.                                                            |
| [`handle-connection-error.ts`](./handle-connection-error.ts) | `isConnectionError`, `promoteApiError`                       | no (forced failure)              | Catch `ClockifyConnectionError` on DNS / TLS / network failures, with a forced reproduction against `127.0.0.1:1`.                                          |
| [`paginated-list-basic.ts`](./paginated-list-basic.ts)       | `paginatedList`, `PaginatedList`                             | yes (read-only)                  | Three uses of `paginatedList(...)`: async iteration, `.toArray({ limit })`, and `.pages()` with per-page metadata.                                          |

## Discrepancy pointers

A few examples touch surfaces with documented spec/runtime
discrepancies. Cross-references:

| Example                      | Discrepancy entry in `spec/evidence/discrepancies.md`                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-webhook.ts`          | `webhook.signature-scheme.shared-secret-not-hmac-doc-only` — header name + scheme is doc-derived; live-probe pending.                                             |
| `paginate-all.ts`            | `fern.x-fern-pagination.bare-array-unsupported` — Fern can't auto-iterate Clockify's bare-array responses; `iterAll` is the wrapper-side workaround.              |
| `auth.ts` (advanced section) | `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive` — `createClockifyClient` hides the cast for users; this example notes the underlying constraint. |
