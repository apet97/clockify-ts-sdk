# Schema Quality Policy

Operation counts are not enough on their own. TypeScript users
experience the OpenAPI through generated request, response, enum, and component
models. Loose schemas, anonymous shapes, duplicate request fields, or missing
enums can make a generated SDK feel unfinished even when every route exists.

## Model quality rules

- Component schemas should carry meaningful names and avoid anonymous catch-all
  shapes when live evidence is known.
- `additionalProperties: true` is allowed only when the Clockify payload is
  genuinely open-ended or the limitation is tracked in the discrepancy ledger.
- Enums should be explicit when Clockify returns a bounded set.
- Request-body schemas must not inherit query parameters or duplicate fields.
- Paginated list request shapes must keep `page` and `page-size` together.
- Path IDs that collide with literal routes should stay constrained so generated
  clients do not blur literal and parameterized endpoints.
- Generated TypeScript request interfaces should remain readable product inputs,
  not `Type_42`-style artifacts or duplicate-member traps.
## Evidence rules

When schema shape changes because of live behavior, record the finding in
`spec/evidence/discrepancies.md` before trusting the generated SDK. When schema
shape changes because the local generator cannot yet express a desired pattern,
record the generator limitation, the local wrapper workaround, and the
re-evaluation trigger.

## Generated model review checklist

Before accepting schema or generator changes, inspect:

1. Corrected OpenAPI component schemas.
2. Operation inventory for SDK group/method stamps.
3. Generated TypeScript request files for duplicate or confusing fields.
4. Wrapper seams that hide generator limitations from users.
5. README and migration docs for user-visible shape changes.

## Proof gates

Before claiming schema/model quality readiness, run or cite:

- `make schema-quality`
- `make openapi-lint`
- `make openapi-evidence`
- `make generator-comparison`
- `make sdk-runtime-contract`
- `make operation-coverage`
