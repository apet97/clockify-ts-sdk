# Migration Guide

This project intentionally uses package names with `115` suffixes for trademark distance from Clockify.

## Package names

| Old or generic expectation | Current package |
|---|---|
| `clockify-sdk-ts` | `clockify-sdk-ts-115` |
| `clockify` CLI | `@clockify115/cli`, binaries `clockify115` and `clk115` |
| Clockify MCP server | `@clockify115/mcp-server`, binary `clockify115-mcp` |

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

Prefer `createClockifyClient()` over constructing the generated `ClockifyApiClient` directly. The factory enforces Clockify's exactly-one-token behavior and hides Fern's current addon-token type workaround.

```typescript
const client = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY! });
```

## Generated surfaces

Do not edit these by hand:

- `spec/corrected/**`
- `output/ts-sdk/**`
- `wrapper/src/**`

Change API shape in GOCLMCP first, regenerate the snapshot, run Fern, then sync the wrapper.

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
