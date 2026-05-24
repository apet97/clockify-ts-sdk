# Drafted upstream issue: `x-fern-pagination` rejects bare-array `results` paths

This is a drafted issue body for `github.com/fern-api/fern`. Not
yet filed. The user (`apet97`) should file it when ready and add
the issue number / URL to
`addons-me/fern/spec/evidence/discrepancies.md > fern.x-fern-pagination.bare-array-unsupported`.

The body below is ready to paste verbatim.

---

## Title

`x-fern-pagination`: support `results` referencing the response body itself (bare-array responses, no envelope)

## Body

### CLI Version (from `fern.config.json`)

`5.37.9` (latest as of 2026-05-25)

### TypeScript SDK Generator

`fernapi/fern-typescript-node-sdk:3.71.2` (latest)

### Minimal API Specification

A list endpoint whose response is a bare top-level JSON array (no
envelope object):

```yaml
openapi: 3.0.3
info:
  title: Repro
  version: 1.0.0
paths:
  /things:
    get:
      operationId: listThings
      x-fern-pagination:
        offset: $request.page
        results: $response
      parameters:
        - in: query
          name: page
          schema: { type: integer, format: int32, default: 1 }
        - in: query
          name: page-size
          schema: { type: integer, format: int32, default: 50 }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Thing"
components:
  schemas:
    Thing:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
```

### Actual behaviour

`fern generate --group ts --local --force` fails:

```
[error] Pagination configuration for endpoint listThings must
        define a dot-delimited 'results' property starting with
        $response (e.g. $response.results).
```

We reproduced with three `results` variants — all rejected with the
same error or an analogous "not a valid 'results' type" message:

- `results: $response`
- `results: $response[*]`
- `results: $response.body`

### Expected behaviour

When the operation's success response schema is `type: array`,
allow `results: $response` (or `results: $response.body`, or a
sentinel like `results: $response[]`) to mean "the response body IS
the results array". The generator should emit the same
`AsyncIterable<T>` it does for envelope-wrapped responses — the
only difference is the deserialization step picks the body itself
rather than a property of the body.

### Why this matters

Many production APIs (Clockify being one we ship a Fern-generated
SDK against; see
`https://github.com/apet97/clockify-ts-sdk`) return bare JSON
arrays from list endpoints with no envelope object. The pagination
signal (`Last-Page` boolean header, total count, etc.) lives in
response headers rather than the body. With the current
restriction, these APIs cannot use `x-fern-pagination` at all — even
when the `offset` shape and the underlying loop semantics are
perfectly compatible. Consumers have to ship a hand-written
iterator helper alongside the Fern-generated SDK, duplicating logic
Fern already implements internally for envelope responses.

In our case (Clockify), the wrapper layer ships a hand-written
`paginate<T>` callback iterator + `iterAll(resource, request,
options)` per-resource helpers (with a runtime drift assertion
against a curated `KNOWN_PAGINATED_METHODS` table). We would
happily delete all of that the moment Fern's `x-fern-pagination`
supports bare-array responses.

### Workaround

None at the spec/generator layer. A wrapper-side hand-written
iterator works, but reinvents the pagination machinery Fern already
ships for envelope cases.

### Steps to Reproduce

1. Save the spec above as `repro.openapi.yaml`.
2. `fern init --openapi repro.openapi.yaml`.
3. `fern generate --group ts --local --force`.
4. See the `[error] Pagination configuration for endpoint
   listThings ...` message; generation fails.

### Environment Details

- macOS 15.x (Darwin 24.6.0)
- Node 22
- Docker (current Docker Desktop)
- Fern CLI 5.37.9
- Fern TS-SDK generator 3.71.2

### Related

- Fern docs page on pagination
  (`https://buildwithfern.com/learn/api-definitions/openapi/extensions/pagination`)
  shows examples for envelope responses only — no mention of the
  bare-array case.
- Consumer-side ledger entry + workaround documentation:
  `https://github.com/apet97/clockify-ts-sdk/blob/main/spec/evidence/discrepancies.md#fernx-fern-paginationbare-array-unsupported`.
- The hand-written wrapper that replaces this behaviour:
  `https://github.com/apet97/clockify-ts-sdk/blob/main/wrapper/iter.ts`
  (and `wrapper/pagination.ts`).

---

## Filing checklist for the user

- [ ] Confirm the latest Fern CLI version at file-time
  (`npm info fern-api version`); update the version line if newer.
- [ ] Paste the body into a new issue at
  https://github.com/fern-api/fern/issues/new — labels applied by
  maintainers.
- [ ] Once filed, capture the issue number + URL and append it
  under the matching ledger entry's "Update" section in
  `addons-me/fern/spec/evidence/discrepancies.md > fern.x-fern-pagination.bare-array-unsupported`.
- [ ] If Fern responds with a fix-in-progress, change the ledger
  entry status to `awaiting-upstream-fix-PR-link-#NN` and update
  `wrapper/CHANGELOG.md`'s `[Unreleased]` section so a future v2.0
  release can flag the deprecation of the hand-written `paginate`
  + `iterAll` helpers.
