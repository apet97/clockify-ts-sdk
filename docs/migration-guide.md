# Migration Guide

This project intentionally uses package names with `115` suffixes for trademark distance from Clockify.

## Package names

| Old or generic expectation | Current package |
|---|---|
| `clockify-sdk-ts` | `clockify-sdk-ts-115` |
| `clockify` CLI | `@apet97/clockify-cli-115`, binaries `clockify115` and `clk115` |
| Clockify MCP server | `@apet97/clockify-mcp-115`, binary `clockify115-mcp` |

## Version alignment

The coordinated package set is SDK `0.12.1`, CLI `0.3.1`, and TypeScript MCP
`0.6.2`. All three require Node.js `>=22.13.0`; the CLI and TypeScript MCP declare
`clockify-sdk-ts-115 >=0.12.0 <1` as their SDK peer range. Upgrade the SDK before
or alongside either consumer package so npm does not resolve an older SDK surface.

## Import paths

Use the package root for common SDK work:

```typescript
import { createClockifyClient, iterAll, RateLimitError } from "clockify-sdk-ts-115";
```

Use subpaths for narrow imports:

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115/create-client";
import { iterAll } from "clockify-sdk-ts-115/iter";
import { verifyClockifyWebhook } from "clockify-sdk-ts-115/webhooks";
```

## Auth

Prefer `createClockifyClient()` over constructing the generated `ClockifyApiClient` directly. The factory enforces Clockify's exactly-one-token behavior and adds env fallback, request IDs, user-agent headers, hooks, and retry configuration.

```typescript
const client = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY! });
```

## Generated surfaces

Do not edit these by hand:

- `spec/corrected/**`
- `output/ts-sdk/**`
- `wrapper/src/**`

Change API shape in GOCLMCP first, regenerate the snapshot, then run `make sdk-codegen` to refresh local generated output and sync the wrapper.

## From Fern-generated core to local generated core

Older repo guidance described `spec/fern/**`, `fern check`, `fern generate`,
Docker, and a Fern TypeScript generator image as the required SDK generation
path. That is now historical context only.

Use the repo-owned local generator instead:

```bash
npm ci
make sdk-codegen
make sdk-codegen-drift
make sdk-codegen-test
```

The public package surface is intended to stay stable across the migration:
`ClockifyApiClient`, `createClockifyClient`, `withRawResponse()`, typed status
errors, pagination helpers, webhooks, scoped clients, diagnostics, health, rate
limit helpers, OTel hooks, and the documented subpaths remain the supported
entry points. Code that imported from `wrapper/src/**`, `output/ts-sdk/**`, or
Fern-generated internals should migrate to `clockify-sdk-ts-115` package exports.

## Typed request bodies

Build requests against the generated operation type. For replace-style writes,
construct the body-envelope arm explicitly so required fields stay visible to
TypeScript and untouched values can be carried forward safely:

```typescript
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

const current = await client.clients.get({ workspaceId, clientId });
const body: ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> = {
    name: current.name,
    ...(current.address != null ? { address: current.address } : {}),
    ...(current.currencyCode !== undefined ? { currencyCode: current.currencyCode } : {}),
    ...(current.email != null ? { email: current.email } : {}),
    ...(current.note != null ? { note: current.note } : {}),
    archived: true,
};
const request: ClockifyApi.UpdateClientsRequest = { workspaceId, clientId, body };
await client.clients.update(request);
```

For operations whose flattened form already matches the wire contract, bind it
directly instead:

```typescript
const request: ClockifyApi.TaskCreateRequest = {
    workspaceId,
    projectId,
    name: "Review",
    billable: false,
};
await client.tasks.create(request);
```

Validate open JSON input with an operation-specific strict schema before
building either form. Assign protected workspace, entity, date, pagination, and
filter fields after validated extras so callers cannot override scope.

## CLI behavior

CLI exit codes: 0 means success; 1 means runtime/config/API failure; 2 means command-line usage error.

- `0` means success.
- `1` means runtime/config/API failure.
- `2` means command-line usage error.
- `--json` errors include `ok:false`, `error`, `code`, `recovery`, and `retryable`.

## MCP behavior

Every MCP tool returns the shared envelope in `content[0].text` and `structuredContent`. Every advertised tool has an output schema for that envelope.

## Breaking change review

Replacement first: add the new SDK export, CLI command, MCP tool, package path, or OpenAPI-generated method before removing the old one. Changelog and migration notes must land in the same change as public breakage, and `make breaking-change-review` is the narrow gate before broader package and final proof gates.

## Additive in this version (no breakage)

These are new public names, not replacements — existing imports are unchanged, so no code migration is required to keep working:

- SDK `clockify-sdk-ts-115/resolve` gained list/filter name→id resolvers `resolveUserRefs`, `resolveGroupRefs`, `resolveTagRefs`, and `resolveUserFilter`, alongside the existing `resolveEntityRef` / `resolveUserRef` / `matchByName`.
- SDK `clockify-sdk-ts-115/errors` gained `mapAddonTokenRestriction` and `AddonTokenRestrictionError` (a pure catch-site helper that names an add-on-token 401 hitting an out-of-reach endpoint; API-key 401s stay raw).
- This grew the SDK root public surface from 75 to 81 names at that release; use `docs/sdk-public-api.json` for the generated current surface.
- MCP behavior (this wiring added no tools): the holidays, time-off (policy/request/balance), scheduling, `groups add_member`, and `users` grant/revoke-role tools now resolve a name passed where a user/group/project id is expected to a real id before any write, returning a grounded `clarification` receipt with no API call on an ambiguous or unknown name. 24-hex ids pass through unchanged, and read-filter slots stay list-free. List fields also accept a bare string and number fields a numeric string; the model-visible JSON Schema is unchanged.
