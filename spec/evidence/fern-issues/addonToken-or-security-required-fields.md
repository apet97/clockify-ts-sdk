# Drafted upstream issue: `BaseClientOptions` marks OR-related security-scheme fields as required

**Status: drafted, internal evidence only — NOT FILED upstream.**

Maintainer call (apet97 2026-05-25): the workaround in the
wrapper's `createClockifyClient()` factory is stable; user opted
not to file this issue at github.com/fern-api/fern. The body
below is kept as evidence of the analysis and as a ready-to-file
starting point if the decision is revisited.

If you later decide to file, paste the body verbatim, then record
the issue number under
`addons-me/fern/spec/evidence/discrepancies.md > fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`.

---

## Title

`typescript-node-sdk`: `BaseClientOptions` types OR-related security-scheme fields as **required**, violates OAS 3.0.3 §4.8.30.3

## Body

### CLI Version (from `fern.config.json`)

`5.37.9` (latest as of 2026-05-24)

### TypeScript SDK Generator

`fernapi/fern-typescript-node-sdk:3.71.2` (latest)

### Minimal API Specification

Clockify-style OR security block, faithful to OpenAPI 3.0.3
§4.8.30.3:

```yaml
openapi: 3.0.3
info:
  title: Repro
  version: 1.0.0
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-Api-Key
    AddonTokenAuth:
      type: apiKey
      in: header
      name: X-Addon-Token
paths:
  /ping:
    get:
      operationId: ping
      security:
        - ApiKeyAuth: []
        - AddonTokenAuth: []
      responses:
        "200":
          description: ok
```

Per OAS 3.0.3 §4.8.30.3:

> Each entry of `security` is a Security Requirement Object. Each
> requirement holds the names of security schemes whose AND
> conjunction must be satisfied. The list of multiple requirements
> represents an **OR** of requirements — only one of the listed
> requirements need be satisfied for the request to be authorized.

So `[{ApiKeyAuth: []}, {AddonTokenAuth: []}]` is "use exactly one
of the two". The caller picks; sending both is meaningless (and in
Clockify's case, hard-rejected at runtime with
`HTTP 401 "Multiple or none auth tokens present"`).

### Actual generated TypeScript

`fern generate --group ts --local --force` emits (file
`src/BaseClient.ts`):

```typescript
export type BaseClientOptions = {
    // ... non-auth fields elided ...
    /** Override the X-Addon-Token header */
    addonToken: core.Supplier<string>;          // ← REQUIRED
} & HeaderAuthProvider.AuthOptions;             // ← `apiKey: Supplier<string>` also REQUIRED
```

Both `apiKey` and `addonToken` are required at construction. The
caller cannot satisfy this without providing both — but providing
both then ships both headers on every request, which servers that
follow the OR contract typically reject.

The TS-level workaround we use:

```typescript
const NULL_SUPPLIER = (() => undefined) as unknown as () => string;

new ClockifyApiClient({
    apiKey: process.env.CLOCKIFY_API_KEY!,
    addonToken: NULL_SUPPLIER,  // satisfies the type at compile
                                // time; supplier yields undefined
                                // at runtime, header merge drops it.
});
```

Documented in the consumer's repo at
`addons-me/fern/spec/evidence/discrepancies.md > fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`
and exposed via a `createClockifyClient()` factory that hides the
cast behind a discriminated-union `apiKey` XOR `addonToken` options
shape.

### Expected behaviour

For each OR-listed security requirement in the per-operation
`security` block, Fern's TS-SDK generator should emit the
corresponding auth field as **optional**. The combined typing
should require at least one of the alternatives, ideally via a TS
discriminated union:

```typescript
export type BaseClientOptions =
    | (BaseClientOptionsCommon & { apiKey: core.Supplier<string>; addonToken?: never; })
    | (BaseClientOptionsCommon & { addonToken: core.Supplier<string>; apiKey?: never; });
```

For OR requirements with single-scheme alternatives (the common
case), this prevents the "both headers sent" runtime failure and
matches the OAS contract.

### Suggested heuristic

- If `security` is a single-entry list of single-scheme objects
  (current AND-of-1 case): keep as required.
- If `security` is a multi-entry list (OR case): emit each entry's
  scheme field as optional, with a top-level constraint requiring at
  least one to be supplied. The TS discriminated-union shape is the
  cleanest expression; a runtime invariant check in the constructor
  is the fallback.
- For mixed AND/OR (`[{A: [], B: []}, {C: []}]` = "A+B" OR "C"):
  same rule, but each requirement group's scheme fields stay
  required relative to that group; the union spans the groups.

### Steps to Reproduce

1. Save the spec above as `repro.openapi.yaml`.
2. `fern init --openapi repro.openapi.yaml`.
3. `fern generate --group ts --local --force`.
4. Inspect the emitted `src/BaseClient.ts` — `addonToken` and
   `apiKey` are both `required` fields on `BaseClientOptions`.

### Environment Details

- macOS 15.x (Darwin 24.6.0)
- Node 22
- Docker (current Docker Desktop)
- Fern CLI 5.37.9
- Fern TS-SDK generator 3.71.2

### Related

- OpenAPI 3.0.3 §4.8.30.3 (Security Requirement Object semantics).
- Consumer-side ledger entry + workaround:
  `https://github.com/apet97/clockify-ts-sdk/blob/main/spec/evidence/discrepancies.md#fernsdkauthaddontoken-typed-required-but-mutually-exclusive`.
- Tangentially-related issue #5707 (Fern Docs side; AND case, not
  OR case).

---

## Filing checklist for the user

- [ ] Confirm the latest Fern CLI version at file-time
  (`npm info fern-api version`); update the version line if newer.
- [ ] Paste the body into a new issue at
  https://github.com/fern-api/fern/issues/new — labels are
  applied by maintainers.
- [ ] Once filed, capture the issue number + URL and append it
  under the matching ledger entry's "Update" section in
  `addons-me/fern/spec/evidence/discrepancies.md`.
- [ ] If Fern responds with a fix-in-progress, change the ledger
  entry status to `awaiting-upstream-fix-PR-link-#NN` and update
  `wrapper/CHANGELOG.md`'s [Unreleased] section so the v1.0.0
  release notes can flag the upcoming cast removal.
