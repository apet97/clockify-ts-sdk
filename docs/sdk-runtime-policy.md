# SDK Runtime Policy

The Fern-generated SDK is the transport layer. The product SDK lives in
small hand-written seams that make common production use predictable:
auth, request correlation, retries, pagination, raw responses, webhooks,
no-network diagnostics, health checks, rate limits, scoped workspaces,
deprecation rails, and stable error recovery.

## Rules

1. The factory is the default entrypoint.

   `createClockifyClient` must hide Fern auth quirks, support API-key
   and addon-token modes, read documented environment variables, and
   install the composed fetch wrapper by default.

2. Request behavior must be observable.

   The composed fetch layer must provide User-Agent and request-ID
   headers, lifecycle hooks, and a wrapper retry policy that disables
   nested Fern retries when enabled.

3. Pagination must be ergonomic and bounded.

   `iterAll`, `iterPages`, `paginate`, and `PaginatedList` must remain
   hand-written wrappers over generated list calls. They must validate
   page controls and keep known paginated methods visible.

4. Raw responses must stay easy to inspect.

   `withResponse` must preserve data, headers, status, and request ID
   without making users depend on Fern internals.

5. Errors must be stable and recoverable.

   SDK errors must promote common status and transport failures into
   typed helpers while also exposing shared stable error codes,
   retryability, and recovery text.

6. Webhooks must be first-class.

   Signature verification, event construction, fixtures, and typed event
   names must remain part of the package surface.

7. Operational helpers must stay public.

   No-network diagnostics, health checks, rate-limit parsing, scoped
   workspace clients, OTel hooks, and deprecation warnings are part of
   the durable wrapper layer, not generated-code accidents.

## Required proof

- `make sdk-runtime-contract` checks this policy.
- `make sdk-public-api` checks exports, subpaths, package aliases, and
  stale package-name markers.
- `make perfect-fast` and `make perfect-full` include both gates.
