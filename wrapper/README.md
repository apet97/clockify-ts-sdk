# clockify-sdk-ts-115

[![CI](https://img.shields.io/github/actions/workflow/status/apet97/clockify-ts-sdk/ci.yml?branch=main&label=CI)](https://github.com/apet97/clockify-ts-sdk/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/apet97/clockify-ts-sdk/codeql.yml?branch=main&label=CodeQL)](https://github.com/apet97/clockify-ts-sdk/actions/workflows/codeql.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Reference docs:** <https://apet97.github.io/clockify-ts-sdk/>

TypeScript SDK for the [Clockify](https://clockify.me) REST API.
Generated from the canonical Clockify OpenAPI by this repo's local
TypeScript generator, wrapped with a packable npm layout. 29 resource
modules, 169 operations (135 live-verified — see
[spec-confidence](../docs/spec-confidence.md)), idiomatic `client.<resource>.<verb>()`
naming on 156 of 169 operations (92.3%), and dual ESM + CJS.

Current release: `0.12.0`. Requires Node.js `>=22.13.0`.

- `createClockifyClient()` — single-import factory, env-var
  fallback (`CLOCKIFY_API_KEY` / `CLOCKIFY_ADDON_TOKEN`), no
  user-visible workaround casts
- `clockifyDiagnostics()` — no-network readiness receipt for auth,
  runtime, workspace ID, base URL overrides, warnings, and next steps
- Pagination — per-resource `iterAll` + page-envelope `iterPages`
    - low-level `paginate` callback iterator;
      `iterPages` consumes the `Last-Page` response header where the
      server emits it (18 of the 21 paginated endpoints)
- Webhook signature verification
  (`Clockify-Signature-Token` header)
- Observability — `User-Agent` + `X-Request-Id` auto-injection,
  lifecycle hooks (`beforeRequest` / `afterResponse` / `onError`
  / `onRetry`), configurable retry policy (`Retry-After` and
  `X-RateLimit-Reset` aware)

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Resource modules](#resource-modules)
- [No-network diagnostics](#no-network-diagnostics)
- [Pagination](#pagination)
- [Error handling](#error-handling)
    - [Connection failures and aborts](#connection-failures-and-aborts)
    - [Error codes](#error-codes)
- [Retries](#retries)
- [Timeouts and abort signals](#timeouts-and-abort-signals)
- [Per-request options](#per-request-options)
- [Operation receipts](#operation-receipts)
- [Logging](#logging)
- [Custom fetch and proxies](#custom-fetch-and-proxies)
- [Webhooks](#webhooks)
- [Hooks and middleware](#hooks-and-middleware)
- [Idempotency keys](#idempotency-keys)
- [Deprecations](#deprecations)
- [ESM and CommonJS](#esm-and-commonjs)
- [Supported runtimes](#supported-runtimes)
- [Quality and tooling](#quality-and-tooling)
- [Migration and contributing](#migration-and-contributing)

---

## Install

```bash
npm install clockify-sdk-ts-115
```

This is an **unofficial, community-built** package (not affiliated with
CAKE.com or Clockify); the `-115` suffix is deliberate trademark distance.

To build and install from this clone instead:

```bash
cd wrapper
npm install
npm run build
npm pack --dry-run
npm pack
npm pack --json
npm install ./clockify-sdk-ts-115-<version>.tgz
```

## Quick start

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";

// Reads CLOCKIFY_API_KEY (or CLOCKIFY_ADDON_TOKEN) from env.
const client = createClockifyClient();

const tags = await client.tags.list({
    workspaceId: process.env.CLOCKIFY_WORKSPACE_ID!,
});

for (const tag of tags) console.log(tag.id, tag.name);
```

`createClockifyClient` is the recommended entry. It accepts at
most one of `apiKey` or `addonToken` (or reads from env when both
are omitted), wraps `fetch` with `composedFetch` for
`User-Agent` + `X-Request-Id` injection, and routes through your
hooks / retry policy.

## Authentication

Clockify exposes two mutually-exclusive auth schemes:

| Scheme                  | Header          | When to use                                                                                                            |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Personal API key        | `X-Api-Key`     | Server scripts, CI, agents acting as you. Token at [Clockify profile settings](https://app.clockify.me/user/settings). |
| Marketplace addon token | `X-Addon-Token` | Code running inside a Clockify addon you authored. Token from the install JWT.                                         |

`createClockifyClient` enforces exactly-one at compile time and
runtime — the discriminated-union type rejects passing both:

```typescript
const personal = createClockifyClient({ apiKey: "..." });
const addon = createClockifyClient({ addonToken: "..." });

// ❌ Compile error: both fields can't be set together.
const broken = createClockifyClient({ apiKey: "a", addonToken: "t" });
```

### Env-var fallback

If you omit both, the factory reads from the environment:

| Env var                | Used as      | Precedence (priority)  |
| ---------------------- | ------------ | ---------------------- |
| `CLOCKIFY_API_KEY`     | `apiKey`     | 1 (highest)            |
| `CLOCKIFY_ADDON_TOKEN` | `addonToken` | 2                      |

Explicit options always win. Empty-string env values are treated
as absent. Throws if both env vars are also unset.

```typescript
const client = createClockifyClient(); // reads env
```

`apiKey` and `addonToken` accept any `Supplier<string>` — a
string, `Promise<string>`, or sync/async function. Use a function
for tokens that get rotated:

```typescript
const client = createClockifyClient({
    apiKey: () => fetchTokenFromVault(),
});
```

### Advanced (custom auth, no auth)

Bypass the factory and construct `ClockifyApiClient` directly for
non-header auth (mock client, custom OAuth, addon-token-from-JWT):

```typescript
import { ClockifyApiClient } from "clockify-sdk-ts-115";

const client = new ClockifyApiClient({
    apiKey: "...",
    auth: false, // or a custom AuthProvider / function
});
```

The generated client models `apiKey` and `addonToken` as mutually
exclusive. `createClockifyClient` remains the recommended entry because
it adds env fallback, request IDs, user-agent headers, hooks, and retry
configuration.

### Authenticated raw requests

`ClockifyApiClient.fetch()` is the authenticated escape hatch for an endpoint
that is not yet represented by a generated method. Relative targets resolve
against the configured base path; absolute strings, `URL` values, and
`Request` inputs must have the same origin as that base. Base suppliers resolve
in `baseUrl` → `environment` → default order and are validated before
authentication. Non-loopback HTTP is always rejected, and a non-Clockify HTTPS
host requires `allowNonClockifyHttpsHost: true`.

```typescript
const response = await client.fetch("workspaces/ws-id/example", {
    method: "PUT",
    body: JSON.stringify({ enabled: true }),
});
```

Input `Request` properties are preserved unless `init` overrides them. Header
precedence is input Request → client defaults → `init` → request options → SDK
authentication, so callers cannot replace the configured auth header. Query
overrides replace existing values; arrays become ordered repeated values and an
empty array removes the key. Signal precedence is request options → `init` →
input Request. Timeout precedence is request options → client options; retry
precedence is request options → client options → two retries.

Only `GET`, `HEAD`, `OPTIONS`, `PUT`, and `DELETE` retry by default, for status
`408`, `429`, `500`, `502`, `503`, or `504`. Retry and timeout controls are
validated before dispatch. Retryable bodies must be cloneable: the SDK builds
one finalized `Request` template, preflights replayability, and dispatches a
fresh clone for every attempt. Caller abort reasons are preserved, retryable
response bodies are cancelled before abort-aware backoff, and authenticated
requests never follow redirects (`redirect: "follow"` is rejected).

## No-network diagnostics

Use `clockifyDiagnostics()` before constructing a client when you want a
local readiness receipt without contacting Clockify. It never returns raw
tokens; auth values are reported only as configured/redacted. Pair it with
`client.health()` for the first live credential probe.

```typescript
import { clockifyDiagnostics, createClockifyClient } from "clockify-sdk-ts-115";

const diagnostics = clockifyDiagnostics();
if (!diagnostics.ok) {
    console.error(diagnostics.readiness, diagnostics.next);
    process.exit(1);
}

const client = createClockifyClient();
const health = await client.health();
```

The diagnostics receipt includes `checks`, `warnings`, and `next` fields
for operator runbooks and support bundles. It checks `CLOCKIFY_API_KEY`,
`CLOCKIFY_ADDON_TOKEN`, `CLOCKIFY_WORKSPACE_ID`, Node.js 22.13+, and base URL
overrides without creating network traffic.

## Resource modules

One sub-client per OpenAPI tag (31 modules). Two name shapes
co-exist; the table summarises which is which.

| Cohort              | Modules                                                                                                                                                                                                                                                                     | Verbs                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pure CRUDL          | `tags`, `clients`, `projects`, `tasks`, `holidays`, `sharedReports`, `timeOffPolicies`, `userGroups`, `webhooks`, `expenses`, `expenseCategories`, `policies`                                                                                                               | `list`, `create`, `get`, `update`, `delete` (only the verbs the API supports)               |
| CRUDL + action      | `clients.archive`, `expenseCategories.archive`, `policies.archive`                                                                                                                                                                                                          | + an action verb                                                                            |
| Partial CRUDL       | `timeEntries`, `invoiceItems`, `invoicePayments`                                                                                                                                                                                                                            | Limited to what the API actually exposes (e.g. no top-level workspace LIST for timeEntries) |
| Workflow verbs      | `approvals` (`submit` / `resubmit` / `updateStatus`), `timeOff` (`submit` / `withdraw` / `updateStatus`), `scheduling` (`publish` / `copy` / recurring family)                                                                                                              | State-machine verbs that match upstream semantics                                           |
| Mixed               | `invoices` (CRUDL + `filter` / `duplicate` / `export` / `updateStatus`), `reports` (`attendance` / `detailed` / `summary` / `weekly`)                                                                                                                                       | CRUDL plus workflow actions; reports use family-name verbs                                  |
| Scoped naming       | `customFields` (`listForWorkspace` / `listForProject` / etc.)                                                                                                                                                                                                               | The module covers two surfaces; suffix disambiguates                                        |
| OperationId-derived | `files.uploadImage`, `expenseReport.generateDetailedReportV1`, per-user `workspaces.updateUser*`, plus a handful of action verbs inside the stamped modules (`projects.assignOrRemoveProjectUsers`, scheduling capacity totals, etc.) | Already verb-noun; rename buys nothing                                                      |

Coverage: 156 ops mapped (92.3% of 169 OpenAPI operations; 135 [live-verified](../docs/spec-confidence.md))
across 27 of 29 modules. Full per-method index in
[`docs/resources/`](./docs/resources/) (one markdown file per
module, regenerated by `scripts/gen-resource-docs.ts` on every
`npm run sync`). Stamping details:
`spec/evidence/discrepancies.md` →
`fern.x-fern-sdk-method-name.drops-resource-modules`.

## Pagination

Clockify list endpoints accept `page` (1-based, default 1) and
`page-size` (default 50, max 200). Responses are bare JSON
arrays. 18 of the 21 paginated endpoints emit a `Last-Page` header
the wrapper consumes as an authoritative end-of-pages signal.

### `iterAll` — for "give me every record"

A scoped `Workspace` exposes `iterProjects` / `iterTags` /
`iterClients`, which wrap `iterAll` with the `workspaceId` and the
fetcher wired for you — no `.bind` ritual:

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";

const ws = createClockifyClient().workspace("...");

for await (const project of ws.iterProjects({})) {
    console.log(project.name);
}
```

`iterAll(fetcher, baseRequest, options?)` walks pages until the
server signals end-of-pages (via `Last-Page: true` if emitted,
else a non-full page). `options`: `pageSize` (default 50),
`maxPages` (default ∞), `startPage` (default 1, for resume flows).

For a resource without a scoped iterator (or to walk across
workspaces), call `iterAll` directly with a bound fetcher:

```typescript
import { createClockifyClient, iterAll } from "clockify-sdk-ts-115";

const client = createClockifyClient();
const listProjects = client.projects.list.bind(client.projects);

for await (const project of iterAll(listProjects, { workspaceId: "..." })) {
    console.log(project.name);
}
```

> `.bind(client.projects)` preserves the implicit `this` and the
> method's full type signature. Bare references lose `this`; arrow
> wrappers lose type inference.

### `iterPages` — for per-page envelopes

```typescript
import { iterPages } from "clockify-sdk-ts-115";

const listTags = client.tags.list.bind(client.tags);

for await (const { items, page, hasNextPage } of iterPages(
    listTags,
    { workspaceId: "..." },
    { pageSize: 100 },
)) {
    console.log(`page ${page}: ${items.length} tags (more: ${hasNextPage})`);
    if (!hasNextPage) break;
}
```

### `paginate` — the low-level callback iterator

```typescript
import { paginate } from "clockify-sdk-ts-115";

for await (const c of paginate(
    (page, pageSize) => client.clients.list({ workspaceId: "...", page, "page-size": pageSize }),
    { pageSize: 50 },
)) {
    console.log(c.name);
}
```

Use `paginate` when you need per-page logging, manual offset
arithmetic, or custom stop conditions.

### Manual loop

```typescript
for (let page = 1; ; page++) {
    const records = await client.users.list({
        workspaceId: "...",
        page,
        "page-size": 50,
    });
    if (records.length === 0) break;
    for (const u of records) handle(u);
    if (records.length < 50) break;
}
```

### Drift assertion

The `KnownPaginatedMethod` type union exported from
`clockify-sdk-ts-115/iter` enumerates the 14 known paginated
`(resource, method)` pairs. A CI assertion in
`tests/iter.test.ts` verifies each one exists on a fresh client,
catching upstream renames at build time.

## Error handling

Every non-2xx throws a typed error:

| Class                     | Status | When                                                              |
| ------------------------- | ------ | ----------------------------------------------------------------- |
| `ClockifyApiError`        | (any)  | Base. Carries `statusCode`, `body`, `rawResponse`, `cause`.       |
| `BadRequestError`         | 400    | Malformed request body / query.                                   |
| `UnauthorizedError`       | 401    | Missing or invalid `X-Api-Key` / `X-Addon-Token`.                 |
| `ForbiddenError`          | 403    | Authenticated but not permitted.                                  |
| `NotFoundError`           | 404    | Resource doesn't exist or doesn't belong to this workspace.       |
| `MethodNotAllowedError`   | 405    | Wrong verb (rare).                                                |
| `ConflictError`           | 409    | Idempotency / uniqueness conflict (e.g. duplicate tag).           |
| `RateLimitError`          | 429    | Rate limit exceeded. Carries `retryAfterMs` + `rateLimitResetAt`. |
| `InternalServerError`     | 500    | Upstream failure.                                                 |
| `ServiceUnavailableError` | 503    | Backend overloaded or maintenance.                                |
| `ClockifyApiTimeoutError` | —      | `timeoutInSeconds` elapsed before a response.                     |
| `AddonTokenRestrictionError` | 401 | Add-on-token request hit an endpoint outside the add-on token's reach (body says "API is not accessible"), regardless of manifest scopes. Map a raw add-on-token 401 with `mapAddonTokenRestriction`; API-key 401s stay raw. |

`instanceof` checks work (each constructor calls
`Object.setPrototypeOf`):

```typescript
import {
    ClockifyApiError,
    NotFoundError,
    RateLimitError,
    promoteApiError,
    getRequestIdFromError,
} from "clockify-sdk-ts-115";

try {
    await client.tags.get({ workspaceId: "...", tagId: "deleted-tag-id" });
} catch (raw) {
    // 429/409/500/503 are not in the OpenAPI spec per endpoint, so
    // the generated client throws the base ClockifyApiError. `promoteApiError` swaps
    // it for the matching subclass when one exists.
    const err = promoteApiError(raw);
    if (err instanceof NotFoundError) console.log("tag is gone");
    else if (err instanceof RateLimitError) await sleep(err.retryAfterMs ?? 1000);
    else if (err instanceof ClockifyApiError) {
        console.error(
            `request ${getRequestIdFromError(err)} failed with ${err.statusCode}:`,
            err.body,
        );
        throw err;
    }
}
```

`getRequestIdFromError` pulls the `X-Request-Id` the wrapper
injected on the outgoing request — use it to correlate client logs
with server traces.

`promoteApiError(err)` is a no-op on values it doesn't recognise, so
it's safe to drop into any existing catch. Type-guard predicates
(`isClockifyApiError`, `isRateLimitError`, `isConflictError`,
`isInternalServerError`, `isServiceUnavailableError`) are exported
too if you prefer narrowing without re-allocating the error:

```typescript
try { await client.tags.list({...}); }
catch (err) {
    if (!isClockifyApiError(err)) throw err; // not from the SDK
    if (isRateLimitError(err)) await sleep(err.retryAfterMs ?? 1000);
    logger.error({ status: err.statusCode, requestId: getRequestIdFromError(err) });
}
```

### Connection failures and aborts

Two error classes cover the non-HTTP-status failure modes — both
inherit from `ClockifyApiError`, so existing `catch` blocks that
narrow on the base class keep working:

| Class                            | Thrown when                                                                                                | Caller action                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `ClockifyConnectionError`        | The underlying `fetch` failed before getting a response (DNS, TLS, ECONNRESET, `TypeError: fetch failed`). | Retry with backoff; surface as "offline?" UI. |
| `ClockifyAbortError`             | The caller cancelled via an `AbortSignal` (`controller.abort()`).                                          | Do NOT retry — the user asked for a stop.     |
| `ClockifyApiTimeoutError`        | The request exceeded `timeoutInSeconds`.                                                                   | Retry with backoff.                           |

```typescript
import { createClockifyClient, isAbortError, isConnectionError } from "clockify-sdk-ts-115";

const client = createClockifyClient();
const controller = new AbortController();

try {
    await client.tags.list({ workspaceId }, { abortSignal: controller.signal });
} catch (err) {
    if (isAbortError(err)) return; // user cancelled
    if (isConnectionError(err)) {
        // backoff and retry, or fail fast
    }
    throw err;
}
```

These classes are emitted by `promoteApiError(err)` (called
internally on every catch site in the documented examples).
Manual call sites that catch raw generated errors should pipe
through `promoteApiError` first:

```typescript
import { promoteApiError } from "clockify-sdk-ts-115";

try { await client.tags.list({...}); }
catch (err) {
  const e = promoteApiError(err);
  if (isAbortError(e)) { /* ... */ }
}
```

### Error codes

Use `classifyClockifyError(err)` when you want the same stable
recovery vocabulary used by the CLI and MCP surfaces:

```typescript
import { classifyClockifyError } from "clockify-sdk-ts-115";

try {
    await client.tags.create({ workspaceId, name });
} catch (err) {
    const classified = classifyClockifyError(err);
    if (!classified) throw err;

    if (classified.code === "rate_limited" && classified.retryable) {
        // back off, then retry
        return;
    }

    console.error(classified.code, classified.recovery);
    throw err;
}
```

`classifyClockifyError` returns `{ code, recovery, retryable,
statusCode?, serverCode?, message }`. The stable `code` comes from
`docs/error-codes.json`; `serverCode` preserves any Clockify
body-level code.

Use `getStableErrorCode(err)` when only the shared stable code is
needed. Use `getErrorCode(err)` when you specifically want the
server-side body code from Clockify:

```typescript
import { getErrorCode, isClockifyApiError } from "clockify-sdk-ts-115";

try {
    await client.tags.create({ workspaceId, name });
} catch (err) {
    if (isClockifyApiError(err) && getErrorCode(err) === "tag_already_exists") {
        // graceful dedup
        return;
    }
    throw err;
}
```

`getErrorCode` reads `body.code` first, then `body.error.code`;
returns `undefined` when neither is present.

## Retries

By default the SDK retries 408 / 429 / 5xx up to **2 times** with
exponential backoff (initial 1s, max 60s, ±20% jitter), honouring
`Retry-After` and `X-RateLimit-Reset`. Only idempotent methods
(`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`) retry by default —
`POST` and `PATCH` are not, because they may not be safe to repeat.

### Override

```typescript
const client = createClockifyClient({
    retryPolicy: {
        maxRetries: 5,
        initialDelayMs: 500,
        maxDelayMs: 30_000,
        jitter: 0.3,
        retryableStatusCodes: [500, 502, 503, 504],
        retryableMethods: ["GET", "HEAD", "OPTIONS"],
    },
});
```

### Disable

```typescript
const client = createClockifyClient({ retryPolicy: false });
```

### Custom delay

```typescript
const client = createClockifyClient({
    retryPolicy: {
        computeDelay: (attempt, response) => {
            const ra = response?.headers.get("Retry-After");
            if (ra) return Number(ra) * 1000;
            return Math.min(1000 * 2 ** attempt, 30_000);
        },
    },
});
```

### Per-request override

```typescript
await client.tags.list({ workspaceId: "..." }, { maxRetries: 0 });
```

## Timeouts and abort signals

```typescript
const client = createClockifyClient({ timeoutInSeconds: 10 });

const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 5000);

await client.projects.list(
    { workspaceId: "..." },
    { timeoutInSeconds: 3, abortSignal: ctrl.signal },
);
```

Timeouts throw `ClockifyApiTimeoutError`. Caller aborts reject with the
effective signal's exact `reason` (including custom `Error` or primitive
reasons), so cancellation remains distinguishable from SDK timeouts.

### `timeoutMs` shorthand

The axioms doc and most of the JS ecosystem use **milliseconds**
(`setTimeout(ms)`, `AbortSignal.timeout(ms)`). The generated per-call
option is `timeoutInSeconds`. The conversion is straightforward:

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";

const client = createClockifyClient();

// 5-second timeout, expressed two equivalent ways:
await client.tags.list({ workspaceId }, { timeoutInSeconds: 5 });
await client.tags.list({ workspaceId }, { timeoutInSeconds: 5_000 / 1_000 });

// Or define a one-line helper at your call site if you prefer ms:
const ms = (n: number) => ({ timeoutInSeconds: n / 1_000 });
await client.tags.list({ workspaceId }, ms(5_000));
```

We don't ship a `timeoutMs` field on `RequestOptions` because
adding a generated-client-overlapping field would create two ways to spell the
same thing — small ergonomic gain, real risk of "set both,
which one wins?" footguns. The conversion is a single division
when you want it.

## Per-request options

The generated client already takes per-call options as its last argument
(`maxRetries`, `timeoutInSeconds`, `abortSignal`, `queryParams`, `headers`).
The `request-options` subpath gives them a stable public type and small
builders so you never reach into generated internals:

```typescript
import {
    createClockifyClient,
    requestOptions,
    withHeaders,
    withRequestTimeout,
} from "clockify-sdk-ts-115";

const client = createClockifyClient();

await client.tags.list(
    { workspaceId },
    requestOptions({
        ...withRequestTimeout(10),
        ...withHeaders({ "X-Request-Id": "tags-page-1" }),
    }),
);
```

`ClockifyRequestOptions` omits `addonToken` — auth belongs on the client, not
on individual calls. Header values are stringified; `withRequestTimeout`
rejects non-positive timeouts and `withIdempotencyKey` rejects empty keys
(see [Idempotency keys](#idempotency-keys)).

## Operation receipts

`toOperationReceipt()` wraps a generated call in the same receipt vocabulary
the CLI and MCP surfaces emit — `status`, `headers`, `requestId`, `rateLimit`,
`changed`, `warnings`, `next` — without swallowing errors:

```typescript
import { createClockifyClient, toOperationReceipt } from "clockify-sdk-ts-115";

const client = createClockifyClient();

const receipt = await toOperationReceipt(client.tags.list({ workspaceId }), {
    action: "tags.list",
    changed: false,
    next: ["Use iterAll for a full paginated walk."],
});

console.log(receipt.status, receipt.requestId, receipt.data);
```

Errors still throw. Catch them and call `toOperationErrorReceipt()` for the
matching error receipt with a stable `code`, `retryable` flag, and `recovery`
hints:

```typescript
import { toOperationErrorReceipt } from "clockify-sdk-ts-115";

try {
    await toOperationReceipt(client.tags.list({ workspaceId }), { action: "tags.list" });
} catch (error) {
    const receipt = toOperationErrorReceipt("tags.list", error);
    console.error(receipt.code, receipt.recovery);
}
```

## Logging

```typescript
const client = createClockifyClient({
    logging: {
        level: "debug",
        // ILogger-shaped object (debug/info/warn/error methods).
        // Pino, bunyan, winston are all shape-compatible.
        logger: {
            debug: (msg, ...args) => console.debug(msg, ...args),
            info: (msg, ...args) => console.info(msg, ...args),
            warn: (msg, ...args) => console.warn(msg, ...args),
            error: (msg, ...args) => console.error(msg, ...args),
        },
    },
});
```

`debug` logs every request URL and response status; `error` logs only
failures. The logging layer does **not** emit request or response
**headers**, so the SDK itself never writes `Authorization` / `X-Api-Key`
/ `X-Addon-Token` to your logger. If you add your own header logging via
`hooks` (whose `ctx.headers` carries the live auth credentials), redact
them yourself. For a fully-wired Pino adapter see
[`examples/structured-logging.ts`](./examples/structured-logging.ts).

## Custom fetch and proxies

```typescript
import { ProxyAgent, fetch as undiciFetch } from "undici";

const dispatcher = new ProxyAgent("http://proxy.local:8080");
const client = createClockifyClient({
    fetch: (url, init) => undiciFetch(url, { ...init, dispatcher }),
});
```

`createClockifyClient` still wraps your `fetch` with
`composedFetch` for `User-Agent` + `X-Request-Id` injection. Pass
`userAgent: false` or `requestId: false` to opt out if your proxy
already does that.

## Webhooks

Clockify delivery includes a per-webhook 32-char shared-secret in
the `Clockify-Signature-Token` header. Verify with constant-time
compare:

```typescript sdk-include=webhook-express.ts
import { WebhookSignatureMismatchError, constructEvent } from "clockify-sdk-ts-115";

interface ExpressLikeRequest {
    headers: Record<string, string>;
    rawBody: string;
}
interface ExpressLikeResponse {
    status: (code: number) => { send: (body: string) => void };
}

// app.post("/clockify", express.raw({ type: "application/json" }), handler)
export function handler(req: ExpressLikeRequest, res: ExpressLikeResponse): void {
    try {
        const event = constructEvent<{ webhookEvent: string }>({
            headers: req.headers,
            payload: req.rawBody,
            expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN ?? "set-CLOCKIFY_WEBHOOK_TOKEN",
        });
        console.log("received event:", event.webhookEvent);
        res.status(200).send("ok");
    } catch (err) {
        if (err instanceof WebhookSignatureMismatchError) {
            res.status(401).send("invalid signature");
            return;
        }
        res.status(400).send("invalid payload");
    }
}
```

Boolean variant:

```typescript
import { verifyClockifyWebhook } from "clockify-sdk-ts-115";

if (!verifyClockifyWebhook({ headers: req.headers, expectedToken: secret })) {
    return res.status(401).send("invalid");
}
```

Helpers accept headers as `Headers`, `Map<string,string>`,
`Record<string, string|string[]>`, or `Array<[name, value]>`.

The scheme is a **shared-secret token compare**, not HMAC over the
payload. The token rotates via the webhook `/token` endpoint;
treat it as a credential.

## Hooks and middleware

`createClockifyClient` accepts lifecycle hooks for observability
piping (Datadog, Honeycomb, structured logs, retry telemetry):

```typescript
const client = createClockifyClient({
    hooks: {
        beforeRequest: ({ method, url, requestId }) =>
            logger.info({ method, url, requestId }, "→ request"),
        afterResponse: ({ response, durationMs, requestId }) =>
            metrics.histogram("clockify.duration", durationMs, {
                status: response.status,
                requestId,
            }),
        onError: ({ error, durationMs, requestId }) =>
            logger.error({ error, durationMs, requestId }, "× request failed"),
        onRetry: ({ nextAttempt, delayMs, requestId }) =>
            logger.warn({ nextAttempt, delayMs, requestId }, "↻ retrying"),
    },
});
```

Hooks are best-effort: a hook that throws is logged via
`console.warn` but never blocks the request. Hooks may be sync or
return a Promise.

To reuse the composed fetch outside the SDK (e.g. wrap another SDK
with the same observability layer):

```typescript
import { composedFetch } from "clockify-sdk-ts-115/composed-fetch";

const myFetch = composedFetch({
    hooks: { beforeRequest: /* ... */ },
    retryPolicy: { maxRetries: 5 },
});
```

## Idempotency keys

Clockify's server does not currently honor `Idempotency-Key`
headers (verified 2026-05-24). The SDK still lets you set the
header on any write — the value passes through unchanged so that:

- Observability layers (CDNs, edge proxies) can use it for
  client-side dedup.
- Code is future-ready if/when Clockify adds server-side
  idempotency support.

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";
import { randomUUID } from "node:crypto";

const client = createClockifyClient();

const tag = await client.tags.create(
    { workspaceId, name: "weekly-review" },
    { headers: { "Idempotency-Key": randomUUID() } },
);
```

The header threads through the generated client's `RequestOptions.headers` and is
sent on the wire as `Idempotency-Key: <uuid>`. See
`examples/pass-idempotency-key.ts` for a runnable script.

## Deprecations

The SDK uses a two-phase soft-removal convention: a symbol gets a
JSDoc `@deprecated` tag plus a one-time runtime warning in the
release that intends to break, then is removed entirely in the next
major.

```typescript
import { warnOnce } from "clockify-sdk-ts-115/deprecation";

/** @deprecated since v0.8.0 — use `newApi` instead. */
export function oldApi() {
    warnOnce("oldApi", "`oldApi` is deprecated; use `newApi` (since v0.8.0)");
    return newApi();
}
```

`warnOnce(key, message)` dedupes by `key` so a hot path doesn't
spam the user, and is silent under `NODE_ENV === "test"`. Full
contract: [`CONTRIBUTING.md` § Deprecating a public symbol](../CONTRIBUTING.md#deprecating-a-public-symbol).

## ESM and CommonJS

```javascript
// ESM
import { createClockifyClient } from "clockify-sdk-ts-115";

// CommonJS
const { createClockifyClient } = require("clockify-sdk-ts-115");
```

Both module systems resolve via the modern triple-tier `exports`
map. TypeScript picks the correct `.d.ts` per consumer's
`moduleResolution`. Subpaths (`clockify-sdk-ts-115/iter`,
`/webhooks`, `/composed-fetch`, `/create-client`, `/diagnostics`,
`/pagination`, `/with-response`) work in both. The
`/with-response` subpath ships the `withResponse(...)` helper for
lifting `HttpResponsePromise` into a flat `{ data, response, headers,
requestId, status }` shape.

### Which helper do I use?

| You want to… | Use | Subpath |
|---|---|---|
| Turn a name/"me" into a real id (or a grounded "did you mean?") | `resolveEntityRef`, `resolveUserRef`, `matchByName` | `clockify-sdk-ts-115/resolve` |
| Resolve a **list** of user/group/tag names (or a single user filter) to ids in one call | `resolveUserRefs`, `resolveGroupRefs`, `resolveTagRefs`, `resolveUserFilter` | `clockify-sdk-ts-115/resolve` |
| Create a tag/project/client only if it does not already exist | `ensureTag`, `ensureProject`, `ensureClient` (or `ws.ensureTag`/`ensureProject`/`ensureClient` on a scoped client) | `clockify-sdk-ts-115/ensure` |
| Delete a project/client the way the live API allows (GET name → archive → delete; clients use the body-envelope archive quirk) | `archiveThenDeleteProject`, `archiveThenDeleteClient` | `clockify-sdk-ts-115/ensure` |
| Encode Clockify's non-uniform money units | `toMinor`, `toMajor`, `invoiceItemUnitPrice*` | `clockify-sdk-ts-115/money` |
| Build a safe replace-semantics invoice `PUT` body | `invoiceUpdateBodyFromExisting` | `clockify-sdk-ts-115/invoice-body` |
| Resolve relative dates server-side ("yesterday", periods) | `resolveRelativeDay`, `resolvePeriod` | `clockify-sdk-ts-115/dates` |
| Build typed report filters + narrow report responses | `summaryFilter`, `detailedFilter`, `detailedEntries` | `clockify-sdk-ts-115/reports` |
| Run a bounded-parallel bulk operation with collected failures | `mapBounded` | `clockify-sdk-ts-115/bulk` |

The `ensure` helpers are pure (you inject `list`/`create`/`archive`/`delete`),
so they reuse instead of duplicating on a re-run — Clockify does not enforce
name uniqueness, so a naive create silently makes a second "Acme".

## Supported runtimes

The SDK requires Node 22.13 or newer and is tested on Node 22.13 and Node 24 LTS.

| Runtime    | Minimum                                                             | Tested               |
| ---------- | ------------------------------------------------------------------- | -------------------- |
| Node.js    | **22.13.0** (global `fetch`, `AbortSignal.timeout`, `randomUUID`)   | 22.13 and 24 (CI)    |
| TypeScript | **5.0** (`satisfies` operator + const type parameters in `iter.ts`) | 5.6 (dev), 5.x       |
| Bun        | works                                                               | CI smoke             |
| Deno       | works via `npm:` specifier                                          | CI smoke             |
| Browsers   | read-only flows work; **do NOT ship `apiKey` to a browser**         | not in CI            |

## Quality and tooling

The SDK gates every change through a multi-layer CI matrix that
matches what Speakeasy / Stainless SDKs ship:

| Layer           | Tool                                                                                                                                | Where                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Type safety     | `tsc -p tsconfig.json --strict --noUncheckedIndexedAccess`                                                                          | Workspace CI on Node **22.13 + 24**     |
| Type contract   | `vitest --typecheck.only` against `tests/types/*.test-d.ts`                                                                         | CI `build-and-test` step                |
| Lint            | ESLint 9 flat config (typescript-eslint recommended-type-checked + import-x order + no-floating-promises + consistent-type-imports) | CI `lint` job                           |
| Format          | Prettier 3 (4-space, semi, LF, 100-col)                                                                                             | `npm run format:check`                  |
| Bundle ceiling  | `size-limit` with 9 entrypoint ceilings (file-size, no bundling)                                                                    | CI `size` job                           |
| Dual build      | `tsc` ESM + `tsc` CJS + per-format smoke verifying 91 governed root names + 27 subpaths                                             | `build:smoke`                           |
| Tarball gate    | Golden-file snapshot (`.packsnapshot`) of every file that ships in `npm pack`                                                       | Workspace CI (Node 22.13)               |
| Provenance      | Legacy publish workflow remains gated; default stance is no npm publication without explicit maintainer approval                     | CI `release.yml`                        |
| Cross-runtime   | Vitest under **Bun**, name-resolution import under **Deno**                                                                         | CI `bun-smoke` + `deno-smoke`           |
| Static analysis | CodeQL (security-and-quality) on hand-written modules + workflows                                                                   | CI `codeql`                             |
| Spec health     | `make openapi-lint` + `make sdk-codegen-drift` on the corrected snapshot                                                            | root gates                              |

Lint scope is the hand-written wrapper (`*.ts` at root + `tests/**`).
Generated sources under the package's local src tree are wiped on every
`npm run sync`, so linting there would only produce churn; `tsc --strict`
covers them instead.

## Migration and contributing

- Changelog: [`CHANGELOG.md`](./CHANGELOG.md) (not in the npm tarball; lean by design).
- Issues: [github.com/apet97/clockify-ts-sdk/issues](https://github.com/apet97/clockify-ts-sdk/issues).
- Contributor + agent contract: [`AGENTS.md`](../AGENTS.md) at the repo root.
- Deprecation convention: [`CONTRIBUTING.md § Deprecating a public symbol`](../CONTRIBUTING.md#deprecating-a-public-symbol).

## License

MIT — see [LICENSE](./LICENSE).
