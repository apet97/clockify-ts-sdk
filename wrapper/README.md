# clockify-sdk-ts

TypeScript SDK for the [Clockify](https://clockify.me) REST API.

Generated from the canonical Clockify OpenAPI specification by [Fern](https://buildwithfern.com); this directory wraps the generator output with a publishable npm package layout.

## Install

```bash
npm install clockify-sdk-ts
```

## Quick start

```typescript
import { ClockifyApiClient } from "clockify-sdk-ts";

const client = new ClockifyApiClient({
  apiKey: process.env.CLOCKIFY_API_KEY!,
  // Clockify's two auth schemes (X-Api-Key and X-Addon-Token) are
  // mutually exclusive at the server layer but typed as both-required
  // by Fern. Yield undefined so the addon-token header is dropped.
  addonToken: (() => undefined) as unknown as () => string,
});

const tags = await client.tags.getWorkspacesWorkspaceIdTags({
  workspaceId: process.env.CLOCKIFY_WORKSPACE_ID!,
});

for (const tag of tags) {
  console.log(tag.name);
}
```

The `apiKey` is sent as `X-Api-Key` on every request. Get one from the [Clockify profile settings](https://app.clockify.me/user/settings).

> **Note on the `addonToken` cast.** Clockify's OpenAPI declares
> `X-Api-Key` and `X-Addon-Token` as two distinct auth schemes
> (use one, not both). Fern's generated `BaseClientOptions` types
> both as required, but sending both headers causes Clockify to
> respond with `HTTP 401 — Multiple or none auth tokens present`.
> The cast above yields `undefined` from the addon-token supplier
> so the SDK's header-merge layer drops the field. This is tracked
> as a Fern-side typing issue; once upstream fixes the OR-vs-AND
> security-scheme inference, this cast can be removed.

## Resource modules

The client exposes one sub-client per OpenAPI tag (32 modules at the time of writing):

`approvals`, `auditLogReport`, `balances`, `clients`, `customFields`, `entityChangesExperimental`, `expenseCategories`, `expenseReport`, `expenses`, `files`, `holidays`, `invoiceItems`, `invoicePayments`, `invoiceSettings`, `invoices`, `memberProfiles`, `policies`, `projects`, `reports`, `roles`, `scheduling`, `sharedReport`, `tags`, `tasks`, `timeEntries`, `timeOff`, `timeOffPolicies`, `userGroups`, `users`, `webhooks`, `workspaces`

Each sub-client exposes one method per operation, with the operationId-derived name from the OpenAPI spec.

## Pagination

List endpoints accept `page` (1-based) and `page-size` (default 50, max 200) query parameters. Responses are bare JSON arrays; the live API sets a `Last-Page: <bool>` response header indicating whether more pages exist.

This SDK does **not** ship auto-pagination helpers — Fern CLI 5.37.9's `x-fern-pagination` offset-mode requires an envelope-shaped response (`results: $response.<field>`) which Clockify's bare-array responses don't satisfy. Loop manually:

```typescript
const pageSize = 50;
for (let page = 1; ; page++) {
  const records = await client.clients.getWorkspacesWorkspaceIdClients({
    workspaceId,
    page,
    pageSize,
  });
  if (records.length === 0) break;
  for (const record of records) handle(record);
  if (records.length < pageSize) break;
}
```

A first-class iterator helper is on the roadmap once the upstream pagination support catches up.

## Build & publish workflow

```bash
# 1. Regenerate the canonical OpenAPI from upstream sources (in GOCLMCP)
(cd ../../GOCLMCP && make gen-openapi)

# 2. Refresh fern's corrected snapshot
cp ../../GOCLMCP/docs/openapi/clockify-openapi.yaml \
   ../spec/corrected/clockify.corrected.openapi.yaml

# 3. Regenerate the TypeScript SDK to ../output/ts-sdk/
(cd ../spec/fern && fern generate --group ts --local --force)

# 4. Sync the generator output into wrapper/src/
npm run sync

# 5. Type-check + build to dist/
npm run type-check
npm run build

# 6. Dry-run publish (always do this before npm publish)
npm publish --dry-run
```

The `prepublishOnly` script runs steps 4-5 automatically before `npm publish`.

## Provenance

This SDK is generated from `addons-me/GOCLMCP/docs/openapi/clockify-openapi.yaml` — the curated canonical Clockify OpenAPI maintained in the [apet97/go-clockify](https://github.com/apet97/go-clockify) repository's `GOCLMCP/` subtree. Each operation carries an `x-clockify-source-files` annotation listing the upstream evidence that informed its shape (real OpenAPI exports, live probes, Markdown documentation, and QA findings).

For the spec-evidence ledger documenting deltas between the published Clockify spec and the live API behavior, see `addons-me/fern/spec/evidence/discrepancies.md`.

## License

MIT — see [LICENSE](./LICENSE).
