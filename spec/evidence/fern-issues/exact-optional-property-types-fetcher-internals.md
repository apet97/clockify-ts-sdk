# Drafted upstream issue: TS generator emits patterns incompatible with `exactOptionalPropertyTypes`

> **RESOLVED 2026-06-22 — this document is now HISTORICAL (Fern era).** The repo no
> longer uses the Fern `fern-typescript-node-sdk` runtime described below; the active SDK
> is emitted by this repo's local generator `scripts/generate-sdk-from-openapi.mjs`, which
> uses a lean `request()` runtime (no `core.fetcher` resource clients). The residual
> `exactOptionalPropertyTypes` + `noImplicitOverride` errors were **12** (not the ~840
> below), all in the local generator's error-class scaffold + `core/request.ts`, and were
> fixed in that generator on 2026-06-22; both flags are now ON for the wrapper compile and
> the hand-written-only EOPT differential gate was retired. See
> `spec/evidence/discrepancies.md` `strictness.wrapper-eopt-noimplicitoverride-blocked`
> (resolved). The Fern-era analysis below (the ~840-error count, the `core.fetcher`
> patterns, the "external maintainer dependency" / "not worth it" conclusions) no longer
> describes the shipped code and is retained only as historical evidence.

**Status: drafted, internal evidence only — NOT FILED upstream (Fern era; superseded — see banner above).**

Maintainer call (apet97 2026-05-25): not pursuing. The Stainless-default
strict-pair (`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
is desirable in principle, but the `exactOptionalPropertyTypes` half
gates on Fern internal patterns we don't own, and enabling it would
catch no real bugs in this SDK — the patterns Fern emits are stylistic
(`undefined` round-tripping through optional fields), not unsafe. The
companion `noUncheckedIndexedAccess` flag shipped clean in v0.6.0 and
delivers the more useful strictness independently.

`noUncheckedIndexedAccess` enabled in v0.6.0 (commit `5d99532`); the
synced SDK at `wrapper/src/**` compiled clean on first try under it,
so the cost/value boundary is sharp: that flag pays its way, this one
doesn't.

If revisited, the upstream PR would need to land in
`fern-api/fern-typescript-node-sdk` (the generator) rather than in
`apet97/go-clockify` (the OpenAPI generator) — see "Where the errors
actually come from" below.

---

## Title

`typescript-node-sdk`: generated fetcher + error code is incompatible with `exactOptionalPropertyTypes: true`

## Body

### CLI version (from `fern.config.json`)

`5.37.9`

### TypeScript SDK generator

`fernapi/fern-typescript-node-sdk:3.71.2`

### Symptom

Enabling `exactOptionalPropertyTypes: true` in a consumer project's
`tsconfig.json` produces ~840 errors in the synced SDK — all of the
form:

```
src/api/errors/BadRequestError.ts:9:15 - error TS2379: Argument of type
  '{ message: string; statusCode: number; body: ClockifyApi.ErrorResponse;
     rawResponse: core.RawResponse | undefined; }'
  is not assignable to parameter of type
  '{ message?: string; statusCode?: number; body?: unknown;
     rawResponse?: RawResponse; cause?: unknown; }'
  with 'exactOptionalPropertyTypes: true'.
  Consider adding 'undefined' to the types of the target's properties.
```

### Where the errors actually come from

Two patterns dominate the 840-error footprint:

1. **Status-class error files** (`src/api/errors/*.ts`). Each
   subclass forwards its constructor's `rawResponse?: core.RawResponse`
   parameter to the base `ClockifyApiError` constructor, which declares
   `rawResponse?: RawResponse`. With `exactOptionalPropertyTypes: true`,
   you can't pass a `RawResponse | undefined` value to a `rawResponse?:
   RawResponse` slot — you must either omit the key or pass exactly
   `RawResponse`.

2. **Resource clients** (`src/api/resources/*/client/Client.ts`). Each
   method calls `core.fetcher({ ..., maxRetries: requestOptions?.maxRetries
   ?? this._options?.maxRetries, abortSignal: requestOptions?.abortSignal,
   fetchFn: this._options?.fetch, ... })`. The fetcher's `Args` type
   declares these fields with `?:`, so passing the optional values
   trips the same rule.

Both patterns are internal to Fern's TS generator templates and are
not influenced by the consumer's OpenAPI spec.

### Reproduction

Any Fern-generated TS SDK reproduces this. In this repo:

```bash
cd wrapper
npm ci
npm run sync
npx tsc -p tsconfig.json --noEmit --exactOptionalPropertyTypes 2>&1 | wc -l
# → 846 lines of errors (as of fern-typescript-node-sdk@3.71.2)
```

### Why `noOptionalProperties: true` doesn't fix it

The generator's `noOptionalProperties: true` config flag (per
[buildwithfern.com/learn/sdks/generators/typescript/configuration](https://buildwithfern.com/learn/sdks/generators/typescript/configuration))
*does* change user-facing schema types from `field?: T` to
`field: T | undefined`. But it does NOT change the
generator-internal fetcher `Args` type or the `ClockifyApiError`
constructor signature — both of those still use `?:`, so the
errors persist. Enabling the flag also introduces a real
user-facing breaking change: previously-optional schema fields
(e.g. `DetailedFilter.auditFilter`, `DetailedFilter.options`,
`DetailedFilter.sortColumn`) become required. Verified empirically
on `fern-typescript-node-sdk@3.71.2` on 2026-05-25.

### Suggested fix (if upstream pursues it)

In the generator templates, change the consumer-of-optional patterns
to use conditional spread:

```ts
// Before:
core.fetcher({
    ...
    maxRetries: requestOptions?.maxRetries ?? this._options?.maxRetries,
    abortSignal: requestOptions?.abortSignal,
    fetchFn: this._options?.fetch,
    ...
});

// After:
core.fetcher({
    ...
    ...(maxRetries !== undefined && { maxRetries }),
    ...(abortSignal !== undefined && { abortSignal }),
    ...(fetchFn !== undefined && { fetchFn }),
    ...
});
```

Same shape for error subclass `rawResponse` forwarding. The runtime
behavior is identical; only the static check changes.

### Value/cost note

This is a strictness flag, not a bug-fixer. The patterns Fern emits
are runtime-safe — they round-trip `undefined` through fields the
implementation treats as absent. Enabling
`exactOptionalPropertyTypes` would catch only spec-vs-implementation
divergences in the SDK author's hand-written wrapper layer, which is
small and already covered by the rest of `strict: true`. The cost
(external maintainer dependency + a template refactor across every
generated method) outweighs the catch.
