# clockify-sdk-ts

[![npm version](https://img.shields.io/npm/v/clockify-sdk-ts.svg)](https://www.npmjs.com/package/clockify-sdk-ts)
[![CI](https://img.shields.io/github/actions/workflow/status/apet97/clockify-ts-sdk/ci.yml?branch=main&label=CI)](https://github.com/apet97/clockify-ts-sdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/clockify-sdk-ts.svg)](./LICENSE)
[![install size](https://packagephobia.com/badge?p=clockify-sdk-ts)](https://packagephobia.com/result?p=clockify-sdk-ts)

TypeScript SDK for the [Clockify](https://clockify.me) REST API.

Generated from the canonical Clockify OpenAPI spec by
[Fern](https://buildwithfern.com) and wrapped with a publishable
npm package layout. 32 resource modules, 193 operations, hand-
written ergonomics for pagination, webhooks, observability hooks,
and configurable retries on top.

- Single-import quick start (`createClockifyClient`) — no
  workaround casts to remember
- Dual ESM + CommonJS publish — `import` and `require` both work
- npm provenance via sigstore (every published version)
- Per-resource auto-pagination (`iterAll`) and a low-level
  callback helper (`paginate`)
- Clockify webhook signature verification
  (`Clockify-Signature-Token` header)
- Observability built in: `User-Agent`, `X-Request-Id`,
  lifecycle hooks, configurable retry policy

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Resource modules](#resource-modules)
- [Pagination](#pagination)
- [Error handling](#error-handling)
- [Retries](#retries)
- [Timeouts and abort signals](#timeouts-and-abort-signals)
- [Logging](#logging)
- [Custom fetch and proxies](#custom-fetch-and-proxies)
- [Webhooks](#webhooks)
- [Middleware and hooks](#middleware-and-hooks)
- [ESM and CommonJS](#esm-and-commonjs)
- [Supported Node and TypeScript versions](#supported-node-and-typescript-versions)
- [Migration and contributing](#migration-and-contributing)

---

## Install

```bash
npm install clockify-sdk-ts
```

Or with your package manager of choice (`pnpm add`, `yarn add`,
`bun add`, `deno add npm:clockify-sdk-ts`).

## Quick start

```typescript
import { createClockifyClient } from "clockify-sdk-ts";

const client = createClockifyClient({
  apiKey: process.env.CLOCKIFY_API_KEY!,
});

const tags = await client.tags.getWorkspacesWorkspaceIdTags({
  workspaceId: process.env.CLOCKIFY_WORKSPACE_ID!,
});

for (const tag of tags) {
  console.log(tag.id, tag.name);
}
```

`createClockifyClient` is the recommended entry point. It accepts
exactly one of `apiKey` or `addonToken`, silently nulls the other,
and wraps the underlying `fetch` with `composedFetch` so every
request carries a `User-Agent` header and an `X-Request-Id` for
log correlation. See [Authentication](#authentication) for the
two-scheme model.

## Authentication

Clockify exposes two mutually-exclusive auth schemes:

| Scheme | Header | When to use |
|---|---|---|
| Personal API key | `X-Api-Key` | Server-side scripts you own; CI; agents acting as your user. Get one from [Clockify profile settings](https://app.clockify.me/user/settings). |
| Marketplace addon token | `X-Addon-Token` | Code running inside a Clockify marketplace addon you authored. Token comes from the addon installation JWT. |

`createClockifyClient` enforces exactly-one-of at both compile
time and runtime — the discriminated-union type rejects passing
both:

```typescript
// API key client
const personal = createClockifyClient({ apiKey: "..." });

// Addon-token client
const addon = createClockifyClient({ addonToken: "..." });

// ❌ Compile error: both fields can't be set together.
const broken = createClockifyClient({ apiKey: "a", addonToken: "t" });
```

`apiKey` and `addonToken` accept any `Supplier<string>` — a
string, a `Promise<string>`, or a sync/async function returning
one. Use a function for tokens that get rotated:

```typescript
const client = createClockifyClient({
  apiKey: () => process.env.CLOCKIFY_API_KEY!,
});
```

### Advanced auth (custom provider, no auth)

If you need a non-header auth model (e.g. mock client in tests,
custom OAuth provider, addon-token-from-JWT), bypass the factory
and construct `ClockifyApiClient` directly:

```typescript
import { ClockifyApiClient } from "clockify-sdk-ts";

const client = new ClockifyApiClient({
  apiKey: "...",
  addonToken: (() => undefined) as unknown as () => string,
  auth: false, // or a custom AuthProvider / function
});
```

The cast workaround is documented in
`spec/evidence/discrepancies.md` →
`fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`.
`createClockifyClient` hides this for the 99% case.

## Resource modules

The client exposes one sub-client per OpenAPI tag (32 modules):

`approvals`, `auditLogReport`, `balances`, `clients`,
`customFields`, `entityChangesExperimental`, `expenseCategories`,
`expenseReport`, `expenses`, `files`, `holidays`,
`invoiceItems`, `invoicePayments`, `invoiceSettings`, `invoices`,
`memberProfiles`, `policies`, `projects`, `reports`, `roles`,
`scheduling`, `sharedReports`, `tags`, `tasks`, `timeEntries`,
`timeOff`, `timeOffPolicies`, `userGroups`, `users`, `webhooks`,
`workspaces`.

Each sub-client exposes one method per operation. Method names
are operationId-derived from the spec
(e.g. `client.tags.getWorkspacesWorkspaceIdTags(...)`) rather than
CRUDL (`client.tags.list(...)`). This is a known limitation —
the CRUDL stamping bumped a Fern-side bug that dropped 12 of 31
resource modules from the TS output. Tracked in
`spec/evidence/discrepancies.md` →
`fern.x-fern-sdk-method-name.drops-resource-modules`. We
re-evaluate on every Fern CLI bump.

## Pagination

Clockify list endpoints accept `page` (1-based, default 1) and
`page-size` (default 50, max 200). Responses are bare JSON
arrays. The SDK ships three pagination primitives at different
levels of abstraction:

### `iterAll` — recommended for "give me every record"

```typescript
import { createClockifyClient, iterAll } from "clockify-sdk-ts";

const client = createClockifyClient({ apiKey: "..." });

for await (const project of iterAll(
  (req) => client.projects.getWorkspaceProjects(req),
  { workspaceId: "..." },
)) {
  console.log(project.name);
}
```

`iterAll(fetcher, baseRequest, options?)` walks pages until a
non-full page comes back (or `maxPages` is reached). `options`
accepts `pageSize` (default 50), `maxPages` (default ∞),
`startPage` (default 1, useful for resume flows).

### `iterPages` — when you need page metadata

```typescript
import { iterPages } from "clockify-sdk-ts";

for await (const { items, page, hasNextPage } of iterPages(
  (req) => client.tags.getWorkspacesWorkspaceIdTags(req),
  { workspaceId: "..." },
  { pageSize: 100 },
)) {
  console.log(`page ${page}: ${items.length} tags (more: ${hasNextPage})`);
  if (!hasNextPage) break;
}
```

### `paginate` — the low-level callback iterator

```typescript
import { paginate } from "clockify-sdk-ts";

for await (const client_ of paginate(
  (page, pageSize) =>
    client.clients.getWorkspacesWorkspaceIdClients({
      workspaceId: "...",
      page,
      "page-size": pageSize,
    }),
  { pageSize: 50 },
)) {
  console.log(client_.name);
}
```

`paginate` exposes the page number directly to the callback — use
it when you need per-page logging, manual offset arithmetic, or
arbitrary stop conditions.

### Manual loop (for full control)

```typescript
for (let page = 1; ; page++) {
  const records = await client.users.findWorkspaceUsers({
    workspaceId: "...",
    page,
    "page-size": 50,
  });
  if (records.length === 0) break;
  for (const u of records) handle(u);
  if (records.length < 50) break;
}
```

### The 19 known paginated methods

Documented as the `KnownPaginatedMethod` type union exported from
`clockify-sdk-ts/iter`. A CI assertion in
`tests/iter.test.ts` verifies each one exists on a fresh client,
so drift in the synced SDK is caught at build time.

## Error handling

Every non-2xx response throws a typed error. The full hierarchy:

| Class | Status | When |
|---|---|---|
| `ClockifyApiError` | (any) | Base class. Always carries `statusCode`, `body`, `rawResponse`, and `cause` (if a downstream error caused it). |
| `BadRequestError` | 400 | Malformed request body or query params. |
| `UnauthorizedError` | 401 | Missing/invalid `X-Api-Key` / `X-Addon-Token`. |
| `ForbiddenError` | 403 | Authenticated but not permitted for this workspace/resource. |
| `NotFoundError` | 404 | Resource doesn't exist or doesn't belong to this workspace. |
| `MethodNotAllowedError` | 405 | Wrong verb (rare). |
| `ClockifyApiTimeoutError` | — | The request's `timeoutInSeconds` elapsed before a response. |

`instanceof` checks work as expected (the SDK calls
`Object.setPrototypeOf` in each constructor):

```typescript
import {
  ClockifyApiError,
  UnauthorizedError,
  NotFoundError,
  getRequestIdFromError,
} from "clockify-sdk-ts";

try {
  await client.tags.getWorkspacesWorkspaceIdTagsTagId({
    workspaceId: "...",
    tagId: "deleted-tag-id",
  });
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log("tag is gone");
  } else if (err instanceof UnauthorizedError) {
    console.error("auth failed:", err.body);
  } else if (err instanceof ClockifyApiError) {
    console.error(
      `request ${getRequestIdFromError(err)} failed with ${err.statusCode}:`,
      err.body,
    );
    throw err;
  }
}
```

`getRequestIdFromError` extracts the `X-Request-Id` we injected
on the outgoing request from the raw response headers — useful
for correlating client-side log entries with server-side traces.

## Retries

By default, the SDK retries 408 / 429 / 5xx responses up to **2
times** with exponential backoff (initial 1s, max 60s, ±20%
jitter), honoring `Retry-After` and `X-RateLimit-Reset` response
headers. Only idempotent methods (`GET`, `HEAD`, `OPTIONS`,
`PUT`, `DELETE`) are retried by default — `POST` and `PATCH` are
NOT retried automatically because they may not be safe to repeat.

### Override the retry policy

```typescript
import { createClockifyClient } from "clockify-sdk-ts";

const client = createClockifyClient({
  apiKey: "...",
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

### Disable retries entirely

```typescript
const client = createClockifyClient({
  apiKey: "...",
  retryPolicy: false,
});
```

### Custom delay calculation

```typescript
const client = createClockifyClient({
  apiKey: "...",
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

Every method's second argument accepts `requestOptions` with
`maxRetries`:

```typescript
await client.tags.getWorkspacesWorkspaceIdTags(
  { workspaceId: "..." },
  { maxRetries: 0 }, // this call only
);
```

## Timeouts and abort signals

```typescript
const client = createClockifyClient({
  apiKey: "...",
  timeoutInSeconds: 10, // applied to every request
});

// Per-request override + cooperative cancellation:
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 5000);

await client.projects.getWorkspaceProjects(
  { workspaceId: "..." },
  { timeoutInSeconds: 3, abortSignal: ctrl.signal },
);
```

Timed-out requests throw `ClockifyApiTimeoutError`. Aborted
requests throw a `ClockifyApiError` whose `body` is the abort
message; check `err.cause` for the underlying `AbortError`.

## Logging

```typescript
import { createClockifyClient } from "clockify-sdk-ts";

const client = createClockifyClient({
  apiKey: "...",
  logging: {
    level: "debug",
    logger: (level, msg, meta) => console.log(level, msg, meta),
  },
});
```

Levels: `debug` logs every request URL + redacted headers and
every response status; `error` logs only failures. Sensitive
headers (`Authorization`, `X-Api-Key`, `X-Addon-Token`, plus 12
more), sensitive query params, and basic-auth credentials in
URLs are redacted before they hit your logger.

## Custom fetch and proxies

Pass a custom `fetch` implementation when you need a proxy
agent, a mocked transport in tests, or a metric-recording wrapper:

```typescript
import { createClockifyClient } from "clockify-sdk-ts";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const dispatcher = new ProxyAgent("http://proxy.local:8080");
const client = createClockifyClient({
  apiKey: "...",
  fetch: (url, init) => undiciFetch(url, { ...init, dispatcher }),
});
```

`createClockifyClient` will still wrap your `fetch` with
`composedFetch` to inject the default `User-Agent` and
`X-Request-Id` headers. Pass `userAgent: false` / `requestId:
false` if your proxy or upstream already does that.

## Webhooks

Clockify webhook delivery includes a per-webhook 32-character
shared-secret token in the `Clockify-Signature-Token` header.
Verify it with constant-time compare:

```typescript
import express from "express";
import {
  constructEvent,
  WebhookSignatureMismatchError,
} from "clockify-sdk-ts";

const app = express();

app.post("/webhook", express.text({ type: "*/*" }), (req, res) => {
  try {
    const event = constructEvent({
      headers: req.headers,
      payload: req.body,
      expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN!,
    });
    handleEvent(event);
    res.status(200).end();
  } catch (err) {
    if (err instanceof WebhookSignatureMismatchError) {
      return res.status(401).send("invalid signature");
    }
    return res.status(400).send("invalid payload");
  }
});
```

Or use `verifyClockifyWebhook` for the boolean variant:

```typescript
import { verifyClockifyWebhook } from "clockify-sdk-ts";

if (!verifyClockifyWebhook({
  headers: req.headers,
  expectedToken: secret,
})) {
  return res.status(401).send("invalid");
}
```

The helpers accept headers as `Headers`, `Map<string,string>`,
plain `Record<string, string|string[]>`, or `Array<[name, value]>`
— matches whatever Node/undici/Express/your-framework emits.

Note: Clockify's scheme is a **simple shared-secret token
compare**, not HMAC over the payload. The token rotates via the
webhook `/token` endpoint; treat it as a credential.

## Middleware and hooks

`createClockifyClient` accepts lifecycle hooks for observability
piping (Datadog, Honeycomb, structured logs, retry telemetry):

```typescript
const client = createClockifyClient({
  apiKey: "...",
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

Hooks are best-effort — a hook that throws is logged via
`console.warn` but never blocks the request. Hooks may be sync
or async (returning a Promise).

For direct access to the underlying composed fetch (e.g. to
wrap a different SDK with the same observability layer), use the
subpath:

```typescript
import { composedFetch } from "clockify-sdk-ts/composed-fetch";

const myFetch = composedFetch({
  hooks: { beforeRequest: ... },
  retryPolicy: { maxRetries: 5 },
});
```

## ESM and CommonJS

The package publishes both module systems via the modern
triple-tier `exports` map:

```javascript
// ESM
import { createClockifyClient } from "clockify-sdk-ts";

// CommonJS
const { createClockifyClient } = require("clockify-sdk-ts");
```

TypeScript resolves the correct `.d.ts` per consumer's
`moduleResolution`. Subpaths (`clockify-sdk-ts/iter`,
`clockify-sdk-ts/webhooks`, `clockify-sdk-ts/composed-fetch`,
`clockify-sdk-ts/create-client`, `clockify-sdk-ts/pagination`)
work in both module systems too.

## Supported Node and TypeScript versions

| | Minimum | Tested |
|---|---|---|
| Node.js | **20.0.0** (required for global `fetch`, stable `AbortSignal.timeout`, `node:crypto.randomUUID`) | 22 (CI primary), 20 |
| TypeScript | **5.0** (required for the satisfies operator + const type parameters used in `iter.ts`) | 5.6 (dev), 5.x |
| Bun | works | not yet in CI (Phase 5) |
| Deno | works with the `npm:` specifier | not yet in CI (Phase 5) |
| Browsers | works for read-only flows; **do NOT ship your `apiKey` to a browser** | not in CI |

## Migration and contributing

- **Changelog:** [`CHANGELOG.md`](./CHANGELOG.md) in the repo
  (intentionally not in the npm tarball — keeps it lean).
- **Issues:** [github.com/apet97/clockify-ts-sdk/issues](https://github.com/apet97/clockify-ts-sdk/issues).
- **Contributing:** see `AGENTS.md` at the repo root for the
  contributor + agent contract. `CONTRIBUTING.md` (human-facing
  onboarding) lands in Phase 6 of the SDK quality push.

## Why no linter

The wrapper ships without ESLint. The hand-written surface
(`create-client.ts`, `composed-fetch.ts`, `iter.ts`,
`webhooks.ts`, `pagination.ts`, `index.ts`, plus `tests/`) is
small, and the rest of `src/` is wiped + rewritten by `npm run
sync` on every regen, so a linter would either lint generated
code that gets discarded next sync, or carry an `eslintignore`
that mostly excludes the tree it's pointed at. `tsc --strict`
catches the issues a default ESLint config would flag on this
surface (unused imports, implicit `any`, missing returns, etc.),
and `vitest` catches real behavioral regressions. Prettier (for
formatting consistency on hand-written files only) is on the
roadmap for Phase 8.

## License

MIT — see [LICENSE](./LICENSE).
