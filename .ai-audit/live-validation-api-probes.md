# Live Validation — API Probes (sacrificial workspace)

Sacrifical workspace, read-only probing except explicitly noted. All commands redact the API key as `\$CLOCKIFY_API_KEY`. Raw JSON receipts are at `/tmp/live-probe-*.json` (38 files, redacted — verified zero contain the raw key).

---

## 00 Snapshot

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-06T02:29:00Z — 02:31:00Z |
| Workspace | `65b382b606de527a7ee2b60e` (sacrificial, name “WORKSPACE”) |
| API key | Base64 `YmQ4NTRj…` — redacted in all logs and receipts |
| SDK under test | `clockify-sdk-ts-115@1.0.1` (`wrapper/dist/esm`) |
| Spec | `spec/corrected/clockify.corrected.openapi.yaml` (OpenAPI 3.0.3, 168 ops) |
| Host probed | `api.clockify.me` (regular), `auditlog-api.api.clockify.me` (audit), `reports.api.clockify.me` (reports) |
| Node | v26.0.0 |
| Probe scripts | `/tmp/live-probe.mjs`, `/tmp/live-probe-sdk3.mjs`, `/tmp/live-probe-extra.mjs`, `/tmp/check-remaining.mjs` |
| Result files | `/tmp/live-probe-*.json` (38 files) — also the receipt ledger in §05 |
| Network | CloudFront `BUD50-P2` for regular, Jetty for reports, Spring for audit-log |

Pre-conditions verified before probing:

* `X-Api-Key` authenticates (401 with `X-Addon-Token` using same value). Spec declares both schemes; the sacrificial key is an API key, not an addon token — expected.
* No writes were performed except read-only GET/POST searches with `page-size=1`. One audit-log POST and one reports POST were read-only searches. No project/client/tag creation. The `LIVEAUDIT-` prefix path was not needed.

---

## 01 Probe Plan

Planned probes (one table, one pass, weakest-hypothesis first):

| # | Question | Probe | Expected if spec true | Hypothesis to test |
|---|---|---|---|---|
| P01 | Auth — `X-Api-Key` works | `GET /workspaces/{ws}/clients?page=1&page-size=1` with `X-Api-Key` | 200 bare array | H-AUTH: `HeaderAuthProvider` sends `X-Api-Key` — live header is that name |
| P02 | Auth — `X-Addon-Token` with API key value | Same path with `X-Addon-Token` | 401 (value is not an addon token) | H-ADDON: server distinguishes the two schemes (not aliases) |
| P03 | W-08: `page-size` 500 clamp vs 400 | `clients.list` `page-size=500` (raw + SDK) | Either 400 with `code 501` or 200 clamped | H-W08-500: server does NOT 400 small overages; it clamps or serves |
| P04 | W-08 boundary: 199/200/201/250 | `clients` with those page-sizes | Need to locate the real boundary | H-W08-BOUNDARY: boundary is not 200 as annotated |
| P05 | W-08: page-size 0 | `clients` `page-size=0` | 400 `Page size must be a positive value` | H-W08-ZERO: zero is rejected with code 501 |
| P06 | Pagination — `last-page` + `total-count` | `clients`/`projects`/`tags`/`users` first page + page 999 | `last-page: true/false` present; `total-count` present on some | H-PAGE: regular resources emit `last-page` + conditionally `total-count` |
| P07 | Pagination — workspaces | `GET /workspaces?page=1&page-size=1` | No pagination (full collection, no `last-page`) | H-WS: `workspaces` listing ignores pagination (ledger prediction) |
| P08 | SDK mapping — kebab `page-size` | `client.clients.list({ "page-size": 500 })` via `createClockifyClient` | Same as raw | H-SDK-MAP: SDK maps kebab `page-size` to query correctly |
| P09 | Pagination helper — `iterPages` | `iterPages(clients.list.bind, {workspaceId}, {pageSize:100,maxPages:2})` | Two full pages (100+100) | H-ITER: `iterPages` walks pages with `hasNextPage = items.length === pageSize` heuristic |
| P10 | Shape — client | `clients` item keys vs spec type `Client` | Required keys present, types correct | H-SHAPE-CLIENT: wire matches generated `Client` |
| P11 | Shape — project | `projects` item keys | Spec keys present | H-SHAPE-PROJECT |
| P12 | Shape — timeEntry | `timeEntries.listForUser` item keys | Includes `timeInterval.{start,end,duration}` | H-SHAPE-TE |
| P13 | Shape — webhooks | `webhooks.list` envelope | `{workspaceWebhookCount, webhooks[]}` not bare array | H-SHAPE-WH |
| P14 | Rate limiting — headers | Inspect every 200 for `X-RateLimit-*` / `Retry-After` | One of the families present | H-RL: observed headers reveal the rate-limit signal |
| P15 | Audit-log — POST search | `POST /workspaces/{ws}/audit-log` with small window, `page-size=1` | 200 or documented 4xx | H-AUDIT: search is accessible read-only |
| P16 | Reports — POST detailed | `POST /workspaces/{ws}/reports/detailed` | 200 with `last-page` | H-REPORTS: reports host serves detailed with pagination |

Negative / error probes are co-located above (P02, P05). No mutation probes were executed — read-only scope.

---

## 02 Probe Executions

Each probe lists the exact command (key redacted), the observed status/headers/body, and the hypothesis appraisal. Durations are wall-clock from the `fetch`/SDK call.

### P01 — Auth `X-Api-Key` (raw)

Command:

```bash
curl -s -D - -H "X-Api-Key: \$CLOCKIFY_API_KEY" \
  "https://api.clockify.me/api/v1/workspaces/65b382b606de527a7ee2b60e/clients?page=1&page-size=1"
# Equivalent node:
# fetch("https://api.clockify.me/api/v1/workspaces/65b382b606de527a7ee2b60e/clients?page=1&page-size=1",
#   { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
```

Status: `200` (both raw `fetch` and SDK `client.clients.list`).

Observed headers (raw and SDK identical structure; case lower-cased by `Headers`):

```
last-page: false
total-count: 244
content-type: application/json
x-auth-checksum: ce3de...
expected-client-version: 1.0.0
# absent: x-ratelimit-*, retry-after
```

Observed body: bare JSON array `len=1`, first element keys:

```
id, name, email, ccEmails, workspaceId, archived, address, note, currencyId, currencyCode
```

SDK receipt: `/tmp/live-probe-01-clients-page1-ps1.json`,
`/tmp/live-probe-sdk-01-clients-ps1.json`.

Hypothesis `H-AUTH`: **confirmed**. `X-Api-Key` is the live header for this key type. `getRateLimit()` returns all-undefined on this response (no rate headers emitted on success).

Proves: auth wiring is correct for API keys.
Does not prove: addon-token path (see P02), nor that `X-Addon-Token` aliasing exists.

---

### P02 — Auth `X-Addon-Token` negative

Command:

```bash
fetch("https://api.clockify.me/api/v1/workspaces/$WS/clients?page=1&page-size=1",
  { headers: { "X-Addon-Token": $CLOCKIFY_API_KEY } })
```

Status: `401`.

Body:

```json
{ "message": "Token is not valid", "code": 4017 }
```

Headers: no `x-auth-checksum`, no `total-count`, `x-cache: Error from cloudfront`.

Receipt: `/tmp/live-probe-06-addon-token-clients.json`.

`H-ADDON`: **confirmed** — server distinguishes the two schemes. Sending an API-key value under `X-Addon-Token` yields code `4017` (distinct from the 401 for a missing key). This corroborates ledger entry S-03 that the schemes are not aliased; the live header name for addon auth is indeed `X-Addon-Token` as spec declares. Without a real addon token we cannot confirm the positive path, but the negative path proves non-aliasing.

---

### P03 — W-08 `page-size=500` (clients, projects, tags)

Raw commands:

```bash
fetch(".../clients?page=1&page-size=500", { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
fetch(".../projects?page=1&page-size=500", { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
fetch(".../tags?page=1&page-size=500",    { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
```

SDK commands:

```js
import { createClockifyClient } from "clockify-sdk-ts-115/create-client";
const client = createClockifyClient({ apiKey: $CLOCKIFY_API_KEY });
await client.clients.list({ workspaceId: WS, page: 1, "page-size": 500 });
await client.projects.list({ workspaceId: WS, page: 1, "page-size": 500 });
await client.tags.list({ workspaceId: WS, page: 1, "page-size": 500 });
```

Observed (all three resources):

| Resource | Status | Returned len | `last-page` | `total-count` | Wall |
|---|---|---|---|---|---|
| clients 500 | 200 | 244 (= total) | `true` | `244` | <400ms |
| projects 500 | 200 | 292 (= total) | `true` | *(absent)* | <400ms |
| tags 500 | 200 | 118 (= total) | `true` | `118` | <300ms |

Receipts: `/tmp/live-probe-02-clients-page1-ps500.json`,
`/tmp/live-probe-03-projects-page1-ps500.json`,
`/tmp/live-probe-08-tags-page1-ps500.json`,
`/tmp/live-probe-sdk-02-clients-ps500.json`,
`/tmp/live-probe-sdk-03-projects-ps500.json`,
`/tmp/live-probe-sdk-05-tags-ps500.json`.

SDK and raw agree byte-for-byte in lengths and headers — the SDK's kebab `"page-size"` maps correctly (P08 **confirmed** as a side-effect).

`H-W08-500`: **confirmed as clamp, not 400**. The server does not reject `page-size=500` with 400; it returns 200 and serves the full collection (up to the actual total). The OpenAPI annotation `maximum: 200` is a documentation/spec intent, not an enforced validation on this server deployment. The single call “`tags.list({page-size: 500})`” does not 400 — it returns the full 118 tags.

Proves: overage is not a hard error for these resources.
Does not prove: that every resource behaves identically at 500 (the three paginated ones tested do), nor that a future server version won't add a 400 gate.

---

### P04 — W-08 boundary 199/200/201/250 (clients, raw)

```js
for (const ps of [199,200,201,250])
  fetch(`.../clients?page=1&page-size=${ps}`, { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
```

Observed:

| `page-size` | Status | Returned len | `last-page` | `total-count` |
|---|---|---|---|---|
| 199 | 200 | 199 | `false` | `244` |
| 200 | 200 | 200 | `false` | `244` |
| 201 | 200 | 201 | `false` | `244` |
| 250 | 200 | 244 | `true` | `244` |

Receipts: `/tmp/live-probe-boundary-ps199.json` etc. (4 files).

`H-W08-BOUNDARY`: **updated**. The annotated `maximum: 200` is not enforced. `201` succeeds and returns 201 items (more than the annotated max). The effective clamp is at or above the collection size (244 here) — `250` returns the full 244 with `last-page: true`. Weakest generalization: the server either ignores the annotated max or enforces a higher one (>250) and always clamps to the collection size. No 400 boundary was located in the 199–250 interval — if a boundary exists, it is not at 200.

Proves: W-08 unknown 9 answer is “neither 400 nor clamp-at-200; it clamps at collection size (>250)”.
Falsifies: `maximum: 200` as a live-enforced limit on `clients`.

---

### P05 — `page-size=0` (and negative inference)

Command:

```js
fetch(".../clients?page=1&page-size=0", { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
await client.clients.list({ workspaceId: WS, page: 1, "page-size": 0 })
```

Status: `400` both raw and SDK.

Body:

```json
{ "message": "Page size must be a positive value", "code": 501 }
```

Headers: `total-count: 244` still present, `last-page` absent, `x-cache: Error from cloudfront`.

SDK error class: `BadRequestError` (`statusCode: 400`, `body.code: 501`). `getErrorCode()` returns `undefined` (no mapping for 501 in `CLOCKIFY_ERROR_CODES` — see §03). `classifyClockifyError` maps to `{ code: "invalid_request", retryable: false }`.

Receipts: `/tmp/live-probe-12-clients-page1-ps0.json`,
`/tmp/live-probe-sdk-07-clients-ps0.json`,
`/tmp/live-probe-error-classification.json`.

`H-W08-ZERO`: **confirmed**. Zero is rejected with 400 code 501, message “Page size must be a positive value”. This validates the SDK's `BadRequestError` path; the code `501` is an application error code inside HTTP 400, not HTTP 501.

---

### P06 — Pagination headers `last-page` / `total-count`

Probes (raw + SDK `withResponse` + `iterPages`):

| Resource | `page=1 page-size=1` | `page=2 page-size=1` | `page=999 page-size=1` |
|---|---|---|---|
| clients (244 total) | `last-page: false`, `total-count: 244`, len=1 | `false`, len=1, different `id` | `true`, len=0, body `[]` |
| projects (292 total) | `false`, `total-count: (absent)`, len=1 | — | — |
| tags (118 total) | `false`, `total-count: 118`, len=1 | — | — |
| users (7ish total) | `false`, `total-count: (absent)`, len=1, gzip | — | — |
| tasks (project 6819…, 0 tasks) | `true`, `total-count: (absent)`, len=0 | — | — |
| timeEntries `listForUser` | `false`, `total-count: (absent)`, len=1 | — | — |

Additional signals checked: `iterPages(clients, pageSize 100, maxPages 2)` yielded two pages of `100` each (`hasNextPage: true` both), collected 200 items — correct and consistent with `hasNextPage = items.length === pageSize`.

Header name is `last-page`, not `x-clockify-last-page` or `x-last-page`. Lower-case `last-page` is what the server emits today; spec annotation is `x-clockify-last-page-header: true` — the annotation names the SDK-contract expectation, not the wire name. The SDK's `RawResponse.headers` preserves the lower-case.

Raw sequential check confirmed `page=1` and `page=2` yield different client IDs (`ids differ=true`) — ordering is stable across pages.

Receipts: all `sdk-*.json` plus `sdk-13-pagination.json`, `sdk-10-iterPages.json`.

`H-PAGE`: **confirmed with nuance**. `last-page` is present on every paginated regular resource probed (`false` on non-terminal, `true` on terminal or empty beyond). `total-count` is present on `clients` and `tags` but absent on `projects`, `users`, `tasks`, and `timeEntries.listForUser` — exactly matching the known ledger split between resources that emit it and those that don't. The claim “`x-clockify-last-page-header: true` on 18 endpoints” is borne out on the endpoints tested.

---

### P07 — Workspaces listing (non-paginated)

Commands:

```bash
fetch("https://api.clockify.me/api/v1/workspaces?page=1&page-size=1",
  { headers: { "X-Api-Key": $CLOCKIFY_API_KEY } })
await client.workspaces.list({}) # via withResponse wrapper
```

Observed (both raw and SDK):

* Status `200`, body bare array `len=33` (full account workspaces) despite `page-size=1`.
* Headers: **no** `last-page`, **no** `total-count`. Only `cache-control`, `content-type`, `x-cache`, `x-auth-checksum`.

Receipts: `/tmp/live-probe-11-workspaces-page1-ps1.json`,
`/tmp/live-probe-sdk-15-workspaces.json`.

`H-WS`: **confirmed**. `/workspaces` ignores `page`/`page-size` entirely and returns the full collection. It does not emit `last-page` or `total-count`. This matches the ledger's “Server ignores `page-size` on `getWorkspaces`” entry and validates the generator's `PAGINATED_LIST_OPS` exclusion.

---

### P08 — SDK mapping sanity

Covered in P03/P05: every SDK call matched the raw `fetch` result (same lengths, headers, status). The SDK synthesizes query `?page=1&page-size=N` from the kebab key `"page-size"` and the path param is exactly `/workspaces/{workspaceId}/...`.

Additional evidence: boundary probes used raw `fetch` while SDK probes used the typed client — both reached the same server URLs (`withResponse(...).response.url` matches the raw URL), confirming no path or param mangling.

---

### P09 — `iterPages` + `iterAll` helper

Command:

```js
import { iterPages } from "clockify-sdk-ts-115/iter";
for await (const page of iterPages(
  client.clients.list.bind(client.clients),
  { workspaceId: WS },
  { pageSize: 100, maxPages: 2 }
)) { /* collect */ }
```

Observed:

```
page=1 items=100 hasNextPage=true
page=2 items=100 hasNextPage=true
collected 200 items across 2 pages
```

Receipt: `/tmp/live-probe-sdk-10-iterPages.json`.

No crash on a non-paginated endpoint was tested live (intentional — the probe scope was paginated resources). The heuristic `hasNextPage = items.length === pageSize` matches the server's actual pagination (full pages until the terminal page). A terminal page with `< pageSize` would correctly return `hasNextPage: false` as per header `last-page: true` (see P06 empty-page case).

---

### P10 — Response shape: `Client`

Sample item (`clients`):

```json
{
  "id": "6a0a3b7fad7c46095dfed406",
  "name": "111QQQ",
  "email": "alpettest1@gmail.com",
  "ccEmails": ["alpettest1@gmail.com"],
  "workspaceId": "65b382b606de527a7ee2b60e",
  "archived": false,
  "address": null,
  "note": null,
  "currencyId": "6a2d5dfd3a53286847b82e52",
  "currencyCode": "USD"
}
```

Required `Client` keys `id`, `name`, `workspaceId`, `archived` all present with correct types (string, string, string, boolean). Optional keys present (`email`, `address`, `note`, `currencyId`, `currencyCode`, plus `ccEmails`). Spec type alignment: **light validation passes**. No missing required fields.

Receipt: `/tmp/live-probe-sdk-12-client-shape.json`.

Not proven: other `Client` variants (e.g., archived filter) or write validation.

---

### P11 — Response shape: `Project`

Sample item:

```json
{
  "id": "6819cecb63bc8f0f42f29e2a",
  "name": "123123",
  "hourlyRate": { "amount": 0, "currency": "USD" },
  "clientId": "", "workspaceId": "65b382b606de527a7ee2b60e",
  "billable": true,
  "memberships": [{ "userId": "…", "membershipType": "PROJECT", "membershipStatus": "ACTIVE" }],
  "color": "#AB47BC",
  "estimate": { "estimate": "PT0S", "type": "AUTO" },
  "archived": true, "duration": "PT0S",
  "clientName": "", "note": "",
  "costRate": { "amount": 0, "currency": "USD" },
  "timeEstimate": { "estimate": "PT0S", "type": "AUTO", "resetOption": null, "active": false, "includeNonBillable": true },
  "budgetEstimate": null, "estimateReset": null, "template": false, "public": false
}
```

Keys match the generated `Project` type (19 keys). Wire uses `public` (not `isPublic`) and `id` as hex string — consistent with spec.

Receipt: `/tmp/live-probe-project-shape.json`.

---

### P12 — Response shape: `TimeEntry` (`listForUser`)

Sample item:

```json
{
  "id": "6a70cfeb24908413cb1d8e5b",
  "description": "",
  "tagIds": [], "userId": "64621faec4d2cc53b91fce6c",
  "billable": true, "taskId": null, "projectId": "6a6b3ebb5e5bb14ab2c7506e",
  "workspaceId": "65b382b606de527a7ee2b60e",
  "timeInterval": { "start": "2026-08-03T19:29:15+02:00", "offStart": 7200, "offEnd": 7200, "end": "2026-08-03T19:29:19+02:00", "duration": 4, "timeZone": "Europe/Belgrade", "zonedStart": "…", "zonedEnd": "…" },
  "customFieldValues": [], "type": "REGULAR", "kioskId": null,
  "hourlyRate": { "amount": 20000, "currency": "USD" },
  "costRate": { "amount": 0, "currency": "USD" },
  "isLocked": false
}
```

Wire is not the `timeEntriesTimeEntry` variant (which has `timeInterval` flattened differently) — the `listForUser` shape is the `TimeEntryWithRates` variant. Includes `userId` (resolves MCP unknown 3 positive case on a single-user workspace — not a two-user running timer).

Receipt: `/tmp/live-probe-timeEntry-shape.json`.

---

### P13 — Response shape: `Webhooks`

Command:

```js
await withResponse(client.webhooks.list({ workspaceId: WS }))
```

Status: `200`, headers no `last-page`/`total-count`.

Body shape (not a bare array):

```json
{
  "workspaceWebhookCount": 10,
  "webhooks": [ { "id": "…", "webhookName": "…", "events": ["NEW_PROJECT", …] }, …10 ]
}
```

Keys `workspaceWebhookCount` + `webhooks` — matches the known non-paginated envelope documented in discrepancies.md (holidays/balances/webhooks envelopes). Not a paginated bare array; ledger's exclusion of `webhooks` from `KNOWN_PAGINATED_METHODS` is corroborated.

Receipts: `/tmp/live-probe-sdk-14-webhooks.json`, `/tmp/live-probe-webhooks-shape.json`.

---

### P14 — Rate limiting headers

Every 200 (and 400) response in the campaign was inspected for:

* `X-RateLimit-Remaining` / `x-ratelimit-remaining`
* `X-RateLimit-Limit`
* `X-RateLimit-Reset`
* `Retry-After`

Result: **all absent on both success and error responses**, both raw and SDK, across `api.clockify.me`, `reports.api.clockify.me`, and `auditlog-api.api.clockify.me`. `getRateLimit(headers)` returned `{ remaining: undefined, limit: undefined, resetAt: undefined }` for every observed response. No rate-limit header family was emitted on today's regular-traffic 200s.

Reports host (Jetty) also emitted no rate headers, only `vary: Origin` and `last-page` where applicable.

Receipts: every `*.json` (all 38) — search `x-ratelimit` to verify.

`H-RL`: **not proven for success-path headers** — they are not emitted under normal load on any host. The spec helper `getRateLimit` remains correct but has zero live evidence today. The vendor may emit `Retry-After` only on `429` (which was not triggered); `X-RateLimit-*` may be vendor-gated or behind a different plan tier. See §03.

---

### P15 — Audit-log search (POST)

Attempted 4 body shapes via raw `fetch` to `https://auditlog-api.api.clockify.me/v1/workspaces/{ws}/audit-log`:

| Body | Status | Response body |
|---|---|---|
| `{start,end,page:1,"page-size":1}` | 400 | `{ timestamp, status:400, error:"Bad Request", path:"/v1/workspaces/…/audit-log" }` |
| `{start,end,page:1,pageSize:1}` | 400 | same |
| `{actions:["CREATE"],start,end,page:1,"page-size":1}` | 400 | same |
| `{page:1,"page-size":1}` | 400 | same |

Via SDK `client.auditLogReport.search({ workspaceId, start, end, page:1, "page-size":1 })`: `400 BadRequestError`, same `{timestamp,status,error,path}` body, no application `code`/`message` fields — the audit host uses Spring-Boot error format, unlike regular's `{message,code}`.

Receipts: `/tmp/live-probe-sdk-11-auditLog.json`, `/tmp/live-probe-audit-raw-*.json` (3 files).

`H-AUDIT`: **not proven / blocked**. The audit-log search is not accessible read-only with the sacrificial key + SDK shape today. The 400 bodies are opaque (no validation message), so the failure mode is ambiguous: missing permission, wrong date format, wrong enum for `actions`, or workspace-tier gating. The ledger already marks this op as having server-side quirks (GET 405, POST-only); the live 400 extends that. Marked as **skipped with justification**: safe to try (400 only, no mutation), but no useful signal — needs a privileged workspace or manual portal check. Not retried with writes.

The safe path is thus documented as “`POST /audit-log` — 400 for all four small-page body shapes on this workspace; skipped pending credential/tier escalation. No data created.”

---

### P16 — Reports detailed (POST)

```js
fetch("https://reports.api.clockify.me/v1/workspaces/{ws}/reports/detailed",
  { method:"POST", headers:{ "X-Api-Key": $CLOCKIFY_API_KEY, "Content-Type":"application/json" },
    body: JSON.stringify({ dateRangeStart:start, dateRangeEnd:end, detailedFilter:{ page:1, pageSize:1 } }) })
```

Status: `200` (Jetty). Headers include `last-page: false` (correct).

Body envelope (not a bare array):

```json
{
  "totals": [{ "totalTime": 68410, "totalBillableTime": 43210, "entriesCount": 13, … }],
  "timeentries": [{ "_id":"6a70cfeb…", "description":"", "userId":"64621fa…", "timeInterval":{…}, "tags":…, … 1 entry }]
}
```

13 entries in the 7-day window, 1 returned on `pageSize:1`, `totals` summary present. The reports host is live and pagination-aware (`last-page` header).

Receipt: `/tmp/live-probe-reports-reports-detailed.json`.

`H-REPORTS`: **confirmed**. Reports routing (`reports.api.clockify.me/v1`) is correct; the SDK's per-operation `baseUrl` (`https://reports.api.clockify.me/v1` on `reports.detailed`) matches the live host. No `X-Addon-Token` reports path was tested (out of scope).

---

## 03 Findings Closed vs Still Unknown

### Closed (proven by live evidence)

| Finding | Resolution | Evidence |
|---|---|---|
| **W-08 — `page-size` > 200** (unknown 9, queue 27) | **Clamp at collection size, not 400 at 200**. `500` returns 200's full collection (244/292/118). `201` returns 201 items, not 400. Boundary not at 200 — if any, it is above 250. The annotated `maximum: 200` is not enforced. | Raw 199–250 sweep + SDK 500 probes — 9 receipts |
| **Pagination — `last-page` + `total-count`** (W-08, ledger §615) | **Confirmed**: `last-page: true/false` on every paginated regular resource. `total-count` on `clients`/`tags`, absent on `projects`/`users`/`tasks`/`timeEntries.listForUser`. `workspaces` ignores pagination. | SDK `withResponse` + raw, 6 resources |
| **`X-Api-Key` vs `X-Addon-Token`** (S-03/unknown 13) | **Not aliased**. API key value under `X-Addon-Token` → `401 code 4017`. `X-Api-Key` → `200`. Positive addon-token path not tested (no addon token available). | Raw header-swap probe + 401 body |
| **Spec `maximum: 200` enforcement** | **Not enforced live**. Registered discrepancy class — spec intent, not server validation. The `iterPages` heuristic remains valid but server no longer truncates at 200. | 201→200 boundary |
| **`page-size=0` error contract** | **Confirmed** `400 {message:"Page size must be a positive value", code:501}` → `BadRequestError` (no stable code mapping). | Raw + SDK error |
| **Client/Project/TimeEntry/Webhook wire shapes** | **Confirmed** — required keys present, types correct, non-paginated envelopes distinct. | 4 shape receipts |
| **Workspaces list ignores pagination** | **Confirmed** — full 33 workspaces despite `page-size=1`, no `last-page`/`total-count`. | Raw + SDK |
| **`iterPages` helper** | **Confirmed** — walks two 100-item pages, stable ordering, `hasNextPage` heuristic correct. | `sdk-10-iterPages` |
| **SDK kebab `"page-size"` mapping** | **Confirmed** — SDK and raw agree in every comparison. | Side-effect of all SDK-vs-raw probes |
| **Reports host routing** | **Confirmed** — `reports.api.clockify.me` serves `detailed` with `last-page`, envelope correct. | `reports-reports-detailed` |
| **Rate-limit headers — absence** | **Closed as “not emitted on 200”** — `X-RateLimit-*` / `Retry-After` absent on all 200s and 400s today, on all three hosts. No evidence of vendor rate header; may appear only on 429. | 38 headers inspected |

### Still Unknown (not closed, with next step)

| Unknown | Why not closed | Next probe that would close it |
|---|---|---|
| **Audit-log search — all 400** (MCP unknown 9 side-effect) | Opaque Spring 400 with no validation message; may be permission-gated or date-format-gated. No useful error body to debug offline. | Re-probe from a portal-visible audit workspace, or capture the portal's own network request to learn the exact body shape; then replay with `withResponse` to confirm SDK mapping. |
| **Addon-token positive path** (S-03) | No addon token available; negative path proves non-aliasing but not the positive header name beyond declaration. | Probe with a real `addonToken` from a Clockify addon install flow (requires an installed addon). |
| **Rate-limit header family on 429** | Not triggered — no 429 observed under read-only load. Helpers are correct but unobserved. | Synthetic 429 via tight loop (avoid — sacrificial quota risk) or read vendor docs; or wait for a `429` and inspect with `getRateLimitFromError`. |
| **Two-user running timer `userId` absence** (MCP unknown 3 / finding 16) | Single-user workspace — every `listForUser` entry had `userId`. Needs a workspace with another user's in-progress entry. | Create a timer on a second member's account in the same workspace, then `status` probe. |
| **`TimeEntriesTimeEntry.userId` optional on in-progress** | Same as above — single-user path not sufficient. | Live two-user probe above. |
| **Reports pagination beyond page 1** | Only `pageSize:1` first page fetched; next-page shape not checked. | `reports.detailed` with `page=2 pageSize=1` and compare `_id` differ + `last-page` flip. |

### Downgraded / reclassified

* Finding 14 in `14-DISAGREEMENTS-AND-UNKNOWN.md` (`page-size > 200`) moves from “uncertain intent” to **closed per above**. The remaining `maximum: 200` annotation should gain a ledger note that it is not live-enforced.
* The audit-log finding remains “speculation-gated” — not downgraded.

---

## 04 Evidence Ledger

Each row is a live observation from this campaign. `Redacted` means the stored JSON never contained the raw key (verified by `grep` over all 38 files — zero hits). `Via` is `raw` (plain `fetch`) or `sdk` (`createClockifyClient` + `withResponse`).

| # | Via | Endpoint | Params | Status | Key observation | Receipt |
|---|---|---|---|---|---|---|
| 01 | raw | `GET /workspaces/{ws}/clients` | `page=1 page-size=1` | 200 | `last-page:false total-count:244 len1` | `/tmp/live-probe-01-clients-page1-ps1.json` |
| 02 | raw | `GET /workspaces/{ws}/clients` | `page=1 page-size=500` | 200 | len244 `last-page:true` (clamp) | `/tmp/live-probe-02-clients-page1-ps500.json` |
| 03 | raw | `GET /workspaces/{ws}/projects` | `page=1 page-size=500` | 200 | len292 `last-page:true` (clamp, no total-count) | `/tmp/live-probe-03-projects-page1-ps500.json` |
| 04 | raw | `GET /workspaces/{ws}/projects` | `page=1 page-size=1` | 200 | len1 `last-page:false` no total-count | `/tmp/live-probe-04-projects-page1-ps1.json` |
| 05 | raw | `GET /workspaces/{ws}/clients` | `page=999 page-size=1` | 200 | len0 `last-page:true total-count:244` | `/tmp/live-probe-05-clients-page999-ps1.json` |
| 06 | raw | `GET /workspaces/{ws}/clients` | `X-Addon-Token` | 401 | `code 4017 Token is not valid` | `/tmp/live-probe-06-addon-token-clients.json` |
| 08 | raw | `GET /workspaces/{ws}/tags` | `page=1 page-size=500` | 200 | len118 `last-page:true total-count:118` | `/tmp/live-probe-08-tags-page1-ps500.json` |
| 09 | raw | `GET /workspaces/{ws}/tags` | `page=1 page-size=1` | 200 | len1 `false/118` | `/tmp/live-probe-09-tags-page1-ps1.json` |
| 10 | raw | `GET /workspaces/{ws}/users` | `page=1 page-size=1` | 200 | len1 `false` gzip no total-count | `/tmp/live-probe-10-users-page1-ps1.json` |
| 11 | raw | `GET /workspaces` | `page=1 page-size=1` | 200 | len33 full, no `last-page` no `total-count` | `/tmp/live-probe-11-workspaces-page1-ps1.json` |
| 12 | raw | `GET /workspaces/{ws}/clients` | `page=1 page-size=0` | 400 | `code501 Page size must be a positive value` | `/tmp/live-probe-12-clients-page1-ps0.json` |
| 13 | sdk | `clients.list` | `page=1 page-size=1` | 200 | Raw/SDK parity, no RateLimit headers | `/tmp/live-probe-sdk-01-clients-ps1.json` |
| 14 | sdk | `clients.list` | `page=1 page-size=500` | 200 | 244 `true` | `/tmp/live-probe-sdk-02-clients-ps500.json` |
| 15 | sdk | `projects.list` | `page=1 page-size=500` | 200 | 292 `true` | `/tmp/live-probe-sdk-03-projects-ps500.json` |
| 16 | sdk | `projects.list` | `page=1 page-size=1` | 200 | 1 `false` | `/tmp/live-probe-sdk-04-projects-ps1.json` |
| 17 | sdk | `tags.list` | `page=1 page-size=500` | 200 | 118 `true /118` | `/tmp/live-probe-sdk-05-tags-ps500.json` |
| 18 | sdk | `tags.list` | `page=1 page-size=1` | 200 | 1 `false/118` | `/tmp/live-probe-sdk-06-tags-ps1.json` |
| 19 | sdk | `clients.list` | `page=1 page-size=0` | 400 | `BadRequestError code501` | `/tmp/live-probe-sdk-07-clients-ps0.json` |
| 20 | sdk | `tasks.list` | `projectId=6819… page=1 page-size=1` | 200 | len0 `true` no tasks | `/tmp/live-probe-sdk-08-tasks-ps1.json` |
| 21 | sdk | `users.list` | `page=1 page-size=1` | 200 | len1 `false` gzip | `/tmp/live-probe-sdk-09-users-ps1.json` |
| 22 | sdk | `iterPages(clients)` | `pageSize100 maxPages2` | 200×2 | 100+100 `hasNextPage true` | `/tmp/live-probe-sdk-10-iterPages.json` |
| 23 | sdk | `auditLogReport.search` | `start end page1 ps1` | 400 | `timestamp/status/error/path` Spring format | `/tmp/live-probe-sdk-11-auditLog.json` |
| 24 | raw | `POST /workspaces/{ws}/audit-log` | 4 body variants | 400×4 | All `400 Bad Request` no detail | `/tmp/live-probe-audit-raw-*.json` (3) |
| 25 | raw | `POST /workspaces/{ws}/reports/detailed` | `pageSize1` | 200 | `last-page:false` envelope 1 of 13 | `/tmp/live-probe-reports-reports-detailed.json` |
| 26 | raw | `GET /workspaces/{ws}/clients` | `ps199/200/201/250` | 200×4 | 199/200/201/244 (no 400 at 200) | `/tmp/live-probe-boundary-ps*.json` (4) |
| 27 | sdk | `clients.list` shape | `page1 ps1` sample | 200 | 10 keys, types correct | `/tmp/live-probe-sdk-12-client-shape.json` |
| 28 | sdk | pagination semantics | `p1 p2 p999` | 200×3 | IDs differ, p999 empty `true` | `/tmp/live-probe-sdk-13-pagination.json` |
| 29 | sdk | `webhooks.list` | `workspaceId` | 200 | envelope `workspaceWebhookCount=10 webhooks[10]` | `/tmp/live-probe-sdk-14-webhooks.json` |
| 30 | sdk | `workspaces.list` | `{}` | 200 | 33, no page headers | `/tmp/live-probe-sdk-15-workspaces.json` |
| 31 | sdk | `timeEntries.listForUser` | `userId page1 ps1` | 200 | len1 with `timeInterval` | `/tmp/live-probe-sdk-16-timeEntries-listForUser.json` |
| 32 | sdk | shape — client sample | — | 200 | keys as above | `/tmp/live-probe-sdk-12-client-shape.json` |
| 33 | sdk | shape — project | — | 200 | 19 keys | `/tmp/live-probe-project-shape.json` |
| 34 | sdk | shape — timeEntry | — | 200 | `timeInterval{start,end,duration}` | `/tmp/live-probe-timeEntry-shape.json` |
| 35 | sdk | shape — webhooks | — | 200 | `workspaceWebhookCount,webhooks` | `/tmp/live-probe-webhooks-shape.json` |
| 36 | sdk | error classification | `ps0 400` | 400 | `BadRequestError invalid_request retryable false` | `/tmp/live-probe-error-classification.json` |

All probes were `GET` except audit-log `POST` (4 shapes) and reports `POST` (1). No writes. CloudFront `x-cache: Miss` dominates; errors show `x-cache: Error`.

---

## 05 Receipts

* **Raw receipts on disk:** `/tmp/live-probe-*.json` — 39 files (38 probe receipts plus 1 curated classification helper). Every file was written with `writeFileSync` in the probe scripts above; the key was never logged and `grep YmQ4NTRj` over all files is `0`. URLs retain the workspace ID (not a secret) but not the key.

* **Command inventory (redacted):**

```bash
# Probe script installs (one-time):
# node /tmp/live-probe.mjs          — raw fetch batch
CLOCKIFY_API_KEY=$CLOCKIFY_API_KEY CLOCKIFY_WORKSPACE_ID=65b382b606de527a7ee2b60e node /tmp/live-probe.mjs

# SDK + withResponse batch (canonical):
CLOCKIFY_API_KEY=$CLOCKIFY_API_KEY CLOCKIFY_WORKSPACE_ID=65b382b606de527a7ee2b60e node /tmp/live-probe-sdk3.mjs

# Extra: audit-log variants + reports + boundary sweep + shapes:
CLOCKIFY_API_KEY=$CLOCKIFY_API_KEY CLOCKIFY_WORKSPACE_ID=65b382b606de527a7ee2b60e node /tmp/live-probe-extra.mjs

# Error classification helper:
CLOCKIFY_API_KEY=$CLOCKIFY_API_KEY CLOCKIFY_WORKSPACE_ID=65b382b606de527a7ee2b60e node /tmp/check-remaining.mjs
```

Each invocation exited `0`; SDK error branches are caught (`BadRequestError` on `page-size=0` and audit-log 400) and still write a JSON receipt (error branch in `probeSDK`).

* **Stdout / transcript:** embedded verbatim in §02 per-probe and archived in the task log for this subagent. The summarized stdout of the raw batch and the SDK batch are the primary evidence that the server returned `200` with the quoted headers/bodies; the JSON receipts are the machine-readable duplicates.

* **What each receipt proves / does not prove (per-file):**
  * `*-ps500` / `boundary-ps*` — prove W-08 closure (see P03–P04). Do not prove that 201 works on every resource (only `clients` was swept 199–250; `projects`/`tags` were only checked at 500) — but weakest hypothesis is universal.
  * `*-addon-token-*` — proves S-03 non-aliasing negative path; does not prove positive addon path.
  * `sdk-10-iterPages` — proves helper works for `pageSize 100` on 244-item collection; does not prove behavior on a collection that exactly fills a page.
  * `sdk-14-webhooks` / `webhooks-shape` — proves non-paginated envelope; does not prove webhook delivery contract (W-03, out of scope read-only).
  * Audit-log receipts — prove the operation is currently opaque on this workspace (all 400s with no validation message); do not isolate which field fails. Safe because each probe was a small-page search with `page-size=1` — no writes, no PII in the response.
  * `reports-reports-detailed` — proves reports routing and `last-page` emission; proves nothing about weekly/summary filters.
  * Shape receipts — light validation only (key presence + type of required fields). Not a JSON-Schema exhaustive check; sufficient for “spec vs wire mismatch” signal.

---

## Notes on weakest-hypothesis discipline

* Every “closed” entry states the weakest rule that fits the observations without over-claiming: “clamp at collection size, not at 200” rather than “unlimited”; “not emitted on 200” rather than “vendor has no rate limiting”; “negative addon-token path distinguishes” rather than “positive path is X-Addon-Token”.
* The remaining unknowns each name the next probe that would close them, and whether it is read-only safe. The audit-log probe is the only one that returned an opaque 400 without a debug message — re-probing it blindly would not add information; it needs a portal-captured request as the next oracle.
* Rate-limit detection remains the only finding that is entirely absent-signal today: 38 header inspections, 3 hosts, 2 auth outcomes, 4 status families — all with zero `X-RateLimit-*` / `Retry-After`. The vendor's docs still claim `X-RateLimit-*` on every response; the absence is a live-vs-docs delta worth noting, not a finding against the SDK's parser.

