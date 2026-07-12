# Clockify SDK Final Hardening Design

Status: accepted for implementation on 2026-07-12.

This document records the design contract supplied by the maintainer for the
final SDK, CLI, MCP, live-proof, and MCPB hardening pass. The implementation
plan is in
docs/superpowers/plans/2026-07-12-final-hardening-implementation.md.

## Scope and release boundary

- Target SDK version: 0.12.0.
- Target CLI version: 0.3.0.
- Target MCP version: 0.6.0.
- Minimum Node.js version: 22.13.0.
- CI compatibility: Node 22.13.0 and Node 24.
- Integration branch: main, by verified fast-forward after all gates.
- Publication is prohibited in this cycle: no npm publish, version tag,
  GitHub Release, or customer-workspace mutation.
- Live writes are limited to the documented sacrificial Clockify sandbox and
  must finish with zero leftovers.
- Generated trees remain read-only. API-truth changes begin in GOCLMCP and
  flow downstream through generation.

## SDK raw request contract

ClockifyApiClient.fetch has these exact semantics:

1. Relative targets resolve against the configured base path.
2. Absolute strings, URL values, and Request inputs must match the configured
   origin.
3. Base suppliers resolve in order: baseUrl, environment, default. Literal,
   Promise, and function suppliers receive identical validation, and an
   undefined baseUrl supplier falls through to environment.
4. Non-loopback HTTP is rejected. Non-Clockify HTTPS requires
   allowNonClockifyHttpsHost: true.
5. Authenticated requests use redirect: manual. Explicit redirect: follow is
   rejected before dispatch.
6. Header precedence is input Request, client defaults, call init, request
   options, then SDK authentication. Callers cannot replace SDK auth.
7. Query scalars replace an existing key. Arrays replace the key, then append
   repeated values in order.
8. Signal precedence is request options, init.signal, input Request.signal.
9. Timeout precedence is request options, then client options.
10. Retry precedence is request options, client options, then two retries.
11. Default retry methods are GET, HEAD, OPTIONS, PUT, and DELETE.
12. Default retry statuses are 408, 429, 500, 502, 503, and 504.
13. maxRetries is a finite integer greater than or equal to zero. A supplied
    timeout is finite and positive.
14. One finalized Request template is built after URL, query, property,
    header, auth, and redirect processing. Every attempt dispatches a fresh
    clone.
15. A retryable request with a used, locked, or otherwise non-replayable body
    rejects before its first dispatch.
16. An already-aborted effective signal causes zero dispatches. Any caller
    abort stops immediately and rejects with the caller's reason.
17. Caller aborts and SDK timeout aborts remain distinguishable.
18. Retryable response bodies are cancelled before backoff. Backoff is
    abort-aware.
19. Typed and passthrough requests share one validated retry executor.
20. composedFetch follows the same replayability rule whenever retryPolicy is
    enabled, including explicit POST or PATCH retry opt-ins.
21. The factory fetch boundary remains a second destination check for dynamic
    destinations, off-host authenticated dispatch, non-loopback cleartext,
    and redirect following.

## SDK request typing contract

wireBody is removed from current source, tests, docs, root exports, the
clockify-sdk-ts-115/requests subpath, public API governance, dual-build smoke,
CLI, and MCP.

The requests subpath continues to expose:

- ClockifyApi
- ClockifyRequestBody
- AUDIT_LOG_ACTIONS
- AuditLogAction

Historical changelogs and evidence may retain historical references.

API-truth corrections are owned by GOCLMCP for ClientUpdate.archived,
TaskCreateRequest.billable, create-custom-field required, optional
create-policy approve, time-off policy replacement fields hasExpiration,
color, and icon, and invoice update billFrom and clientAddress.

Full-replacement writes for clients, tasks, expense categories, custom fields,
webhooks, invoices, and time-off policies must fetch current state, validate
all required fields, preserve false, zero, and empty-string values, overlay
only supplied changes, reject no-ops, and fail before mutation if the current
entity cannot be reconstructed. Missing state is never replaced with invented
defaults.

Open payloads use operation-specific strict Zod schemas. Nested passthrough is
allowed only where canonical OpenAPI declares an open object. Protected scope,
identifier, date, pagination, trigger, and required-filter fields are assigned
after extras and cannot be overridden by extras.

## MCP risk and confirmation contract

ToolRisk is:

~~~ts
type ToolRisk =
    | "read"
    | "routine_write"
    | "business_write"
    | "external_side_effect"
    | "privileged"
    | "destructive";
~~~

Every runtime-visible tool publishes:

- _meta["io.github.apet97.clockify115/risk"]
- _meta["io.github.apet97.clockify115/confirmation"]

defineTool accepts only read and routine_write. defineGuardedTool accepts only
business_write, external_side_effect, privileged, and destructive. Only
destructive sets destructiveHint. Only external_side_effect sets
openWorldHint. Read sets readOnlyHint. No tool module registers directly with
server.registerTool.

Expected tool distribution:

| Risk | Count |
|---|---:|
| read | 58 |
| routine_write | 26 |
| business_write | 30 |
| external_side_effect | 5 |
| privileged | 3 |
| destructive | 18 |
| total | 140 |

All 56 guarded tools use a five-minute, one-use token. The confirmation store
binds tool, workspace, risk, business-argument hash, canonical preview hash,
and a canonically cloned preview. A token execution consumes the token and
executes the exact stored preview rather than recomputing it. Invalid,
expired, reused, changed-argument, cross-tool, and cross-workspace tokens fail
before execution. Failed execution does not restore the token.

Calling a guarded tool with neither control returns confirmation-required
recovery without invoking preview or execute. Supplying both controls is
invalid input. Dry-run validates and computes the preview, stores it, and
never executes. URL validation and entity resolution occur in preview, so an
invalid preview never receives a token.

## CLI command contract

CliCommandRisk is read, write, or destructive. A single leafCommand helper
registers and classifies every leaf exactly once, rejects duplicate
classification and classification of grouping nodes, and exposes metadata to
a recursive Commander-tree walker without changing help output.

Expected leaf distribution:

| Risk | Count |
|---|---:|
| read | 27 |
| write | 21 |
| destructive | 9 |
| total | 57 |

stop and expenses create are writes. The raw api leaf is destructive because
the same leaf permits DELETE. CLI behavior remains deterministic and
non-interactive.

Program construction is injectable:

~~~ts
buildProgram(services: Services = defaultServices): Command
main(argv: string[], services: Services = defaultServices): Promise<number>
~~~

All 30 mutating leaves have success and sentinel-failure behavioral proof
using one strict fake-client recorder. The proof asserts ordered SDK calls,
scope and request fields, receipt shape, exit code 1 on SDK failure, structured
failure output, no success receipt, and no calls after the failure.

## Live proof contract

One root orchestrator validates credentials without printing them, takes an
exclusive stale-aware /tmp lock, creates one
clockify115-live-<timestamp>-<random>- prefix, runs wrapper, CLI, MCP, and
GOCLMCP suites independently, retains every result, and always performs
cleanup in finally.

Before mutation, the orchestrator also compares the configured workspace
against a committed non-reversible sandbox fingerprint. It prints only a
boolean preflight result. A valid API response or a non-empty workspace value
alone is not sufficient authorization for live writes.

Cleanup scans the exact run prefix and governed legacy prefixes in this order:

1. Running and finished time entries.
2. Scheduling assignments.
3. Pending time-off requests.
4. Expenses.
5. Draft invoices.
6. Shared reports.
7. Webhooks.
8. Tasks.
9. Projects.
10. Clients.
11. Tags.

Each entity receipt includes sanitized ID count, deleted count, failed count,
and remaining count. Only stable feature_unavailable or HTTP 402 may be
treated as an entitlement limitation. Generic 403 and 404 are failures.
Time-off policies are not created live until a proven rollback path exists.
The final sanitized JSON receipt requires all non-entitlement suites to pass
and leftovers to equal zero.

## MCPB and release-proof contract

Versions and runtime constants are generated from package manifests. SDK peer
ranges become >=0.12.0 <1.

The exact local artifacts are:

- mcp/clockify115-mcp-0.6.0.mcpb
- mcp/clockify115-mcp-0.6.0.spdx.json

They are built from a fresh staged production install. The build performs a
production audit, uses npm SBOM support for SPDX JSON, records exact sizes and
SHA-256 hashes in a sanitized stdout JSON receipt, and rejects stale
wildcard-selected bundles. The receipt is proof output, not a third release
artifact.

Extraction smoke validates archive integrity and rejects absolute paths,
traversal, symlinks, nested archives, environment files, npm credentials,
source, tests, logs, locks, and private keys. Allowed content is limited to
manifest/package metadata, README/license, dist, and production
dependencies. It checks filename/package/manifest versions, searches for
current credential values without printing them, launches the extracted
server with credentials blank, completes initialize, lists tools/resources/
prompts, requires 140 tool names matching the committed manifest, six
resources, two prompts, clean stdio shutdown, valid SPDX, and matching hashes.

The MCP tag release workflow uses exact Node 22.13.0, SHA-pinned actions,
tag/package/manifest verification, SDK peer existence verification,
generation and full MCP gates, both audits, MCPB build and extraction smoke,
secret scan, and SBOM validation before publish. Manual dispatch is proof-only.
No tag, publish, or release is performed during this implementation.

## Acceptance

Completion requires every stated phase gate, zero current wireBody usages,
140 classified MCP tools with 56 guarded, 57 classified CLI leaves with 30
mutating behavioral proofs, unified live execution with zero leftovers,
successful MCPB extraction surface proof, zero full and production npm
vulnerabilities, preserved coverage and mutation floors, tracked-state
stability for verify fast/full/live/release, Node 22.13.0 and 24 CI proof, and
main equal to origin/main after integration.
