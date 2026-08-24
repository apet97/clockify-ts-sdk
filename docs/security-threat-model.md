# Security Threat Model

This is the practical threat model for the SDK, CLI, MCP server, OpenAPI
generation chain, mock server, and live proof workflow. It is not a replacement
for formal penetration testing. It is the repo-level map that keeps routine
changes from weakening the boring safety rails that matter.

## Security posture

- Tokens are bearer credentials and must never be committed, printed in full, or
  sent to third-party services.
- Generated code is treated as an untrusted dependency boundary. Product behavior
  belongs in reviewed wrapper seams, CLI command handlers, MCP tools, docs, and
  tests.
- The TS MCP server is agent-facing. Any write receipt must be explicit about
  `changed`, identifiers, warnings, and recovery steps.
- Live proof is allowed only in a sacrificial sandbox workspace with cleanup
  receipts.
- Mock and replay endpoints are for deterministic local proof only. They must
  not become a quiet route for sending real tokens to arbitrary hosts.
- Remote OAuth bearer tokens identify a caller only. They are never forwarded
  to Clockify, stored, or treated as a shared tenant credential.
- The Reports App treats every report label, note, tag, color, and timestamp as
  untrusted data and has no external network or frame allowlist.

## Risk surfaces

| Surface | Main failure mode | Required mitigation | Proof gates |
|---|---|---|---|
| Credential handling | `CLOCKIFY_API_KEY`, `CLOCKIFY_ADDON_TOKEN`, `CLOCKIFY_WORKSPACE_ID`, or `NPM_TOKEN` leaks through docs, examples, errors, or logs. | Local SDK/CLI/stdio credentials may use explicit options or environment variables. Remote Clockify keys enter only through admin stdin, while OAuth, key-ring, and database secrets use mode-`0600` files. Use token-shaped scans and keep error/receipt paths redaction-friendly. | `make secret-hygiene`, `make env-contract`, `make observability` |
| Mock/replay base URL | `CLOCKIFY_BASE_URL` is pointed at a non-local endpoint and real credentials are sent outside Clockify or the local mock. | Document it as test-only, keep it covered by env contracts, and treat external base URLs as an operator risk. | `make env-contract`, `make mock-contract`, `make security-threat-model` |
| MCP write safety | An agent accidentally creates, updates, deletes, invoices, expenses, time off, or scheduling data without preview and confirmation. | High-risk workflow writes require `dry_run` and `confirm_token`; destructive tools advertise `destructiveHint: true`; receipts include `changed` and recovery. | `make mcp-write-safety`, `make observability`, `make live-safety` |
| Remote OAuth boundary | A bearer is accepted from the wrong issuer/resource, an invalid JWT falls through to introspection, or the bearer is reused as a Clockify credential. | Trust one exact HTTPS issuer and resource; verify JWT-shaped tokens locally with an asymmetric allowlist and no fallback; bound opaque introspection; require subject, client, expiry, audience, and recognized scope; discard the bearer after verification. | `make mcp-remote-proof`, `make env-contract`, `make secret-hygiene` |
| Remote tenant authorization | One principal reads, mutates, or burns confirmations belonging to another principal/client, or a broad database grant silently supplies a missing token scope. | Resolve exact issuer plus subject to one credential; intersect exact token scopes with the database ceiling; bind confirmations to principal, OAuth client, credential revision, workspace, tool, risk, and argument hash. | `make mcp-remote-proof`, `make mcp-write-safety`, `make data-handling` |
| Remote encrypted storage | A database dump reveals Clockify API keys or exact confirmation previews, or key retirement makes rows unreadable. | Seal credentials and previews with AES-256-GCM and authenticated metadata, store only token hashes, keep the key ring external at mode `0600`, and use measured dual-read/single-write rotation before retirement. | `make mcp-remote-proof`, `make data-handling`, `make secret-hygiene` |
| Remote HTTP ingress | Host or Origin confusion, oversized bodies, session assumptions, redirects, or verbose logs cross the service boundary. | Validate exact Host and configured Origin, cap streamed bodies at 1 MiB, accept only POST `/mcp`, use stateless JSON handlers, disable introspection redirects, and log only bounded structured fields. | `make mcp-remote-proof`, `make mcp-contract`, `make env-contract` |
| MCP App content | Report data injects markup, loads an external avatar/resource, uses an unsafe project color, or lets the App invoke a write. | Render strings with `textContent`, validate colors, omit external URLs, enforce empty CSP allowlists and a 64 KiB model, and allow direct calls to exactly five read-only report tools. | `make mcp-gates`, `make mcp-contract`, `make data-handling` |
| Remote recovery | A migration drifts, an image rollback cannot read the schema, backups lack the matching key ring, or shutdown keeps accepting traffic. | Checksum migrations, readiness-gate the database, drain on signals, bind releases to immutable image digests, back up database plus key ring, and validate restore and rotation before traffic. | `make mcp-remote-proof`, `make mcp-container-service-proof`, `make data-handling` |
| CLI write safety | A script runs a destructive command against the wrong object or hides the target behind interactive prompts. | CLI writes stay non-interactive; destructive commands are ID-scoped; create/update commands return identifiers in JSON receipts. | `make cli-write-safety`, `make cli-contract`, `make observability` |
| Webhook verification | A caller treats Clockify webhook verification like HMAC or accepts unsigned events. | Keep the `Clockify-Signature-Token` shared-secret verifier documented and tested; do not invent stronger semantics than Clockify provides. | `make sdk-runtime-contract`, `make test-matrix` |
| Webhook callback SSRF | A registered callback URL points at an internal service, or a hostname rebinds to a private IP after the offline check passes. | The shared `wrapper/webhook-url.ts` guard rejects non-HTTPS, embedded credentials, internal hostnames, and every non-global IP literal before SDK, CLI, or MCP registration. DNS rebinding is an accepted limitation of the offline guard, tracked as `webhook-url-guard-no-dns-rebinding` in the risk register. | `make security-threat-model`, `make mcp-write-safety` |
| Live proof | Concurrent or mis-scoped local or remote tests mutate a customer workspace, expose identifiers, or leave sandbox/database records behind. | Require exact workspace confirmation, one stale-safe `/tmp` lock, a generated run prefix, paired cleanup, an aggregate dependency-ordered sweep, proof-database teardown, and one count-only zero-leftover receipt. | `make live-safety`, `make test-data-lifecycle`, `make perfect-live`, `make mcp-remote-live-proof` |
| OpenAPI truth chain | Manual edits to snapshots or generated output create undocumented API behavior. | Change upstream sources or generator data first, never hand-edit generated/snapshot paths, and keep discrepancy evidence. | `make generated-edit-check`, `make openapi-evidence`, `make perfect-full` |
| Supply chain and release | A package is published, packed incorrectly, or shipped with unexpected runtime dependencies. | Keep no-default-publish policy, `prepublishOnly` gates, provenance settings, dependency boundaries, and packed-consumer smoke proof. | `make supply-chain`, `make dependency-boundary`, `make pack-smoke` |
| Support-bundle package metadata | A support bundle leaks raw dependency names, resolved package tarball URLs, integrity hashes, or `node_modules` entries while trying to explain package state. | Keep support bundles to package manifest summaries and package-lock summary counts only. | `make support-bundle`, `make data-handling`, `make security-threat-model` |
| First-run support handoff | A setup/support issue jumps from local diagnostics to raw logs, env dumps, live Clockify calls, mutation, or release changes. | Start with `node scripts/plan.mjs workflow --workflow first-run-support`, preserve only safe `safeCommandHints`, and keep the workflow map no-network until an operator deliberately runs mock or sandbox proof. | `make workflow-cookbook`, `make support-bundle`, `make data-handling`, `make security-threat-model` |
| Observability receipts | Request IDs, errors, or spans are missing recovery data or accidentally expose secrets. | Preserve `X-Request-Id`, raw response helpers, stable error codes, OTel hooks, CLI JSON errors, and MCP structured envelopes. | `make observability`, `make sdk-runtime-contract`, `make cli-contract`, `make mcp-contract` |

## Operator rules

1. If a change touches auth, token handling, live proof, write behavior, package
   metadata, release flow, or generated-code boundaries, run
   `make security-threat-model` before claiming the change is safe.
2. If a risk needs a new mitigation, add it to this document and
   `docs/security-threat-model-contract.json` in the same change.
3. If a mitigation depends on live proof, final acceptance requires completed sandbox live proof. A deferred live gate may be recorded as a draft blocker with a concrete reason, but it is not final readiness.
4. If a release or CI/CD setting needs to change, stop and get explicit
   maintainer approval before editing it.

## Required receipts

- `make security-threat-model` checks this document, its contract, supporting
  safety docs, Makefile wiring, docs index wiring, contract inventory wiring, and
  enterprise-audit evidence.
- `make perfect-fast` includes the threat-model contract without requiring live
  credentials.
- `make perfect-full` includes the threat-model contract plus generator,
  local SDK codegen, package, and packed-consumer proof.
- `make perfect-live` is the accepted local SDK/CLI/MCP/GOCLMCP cleanup proof;
  `make mcp-remote-live-proof` separately proves the authenticated remote
  composition and its database teardown against the same guarded sandbox.
- `make mcp-remote-proof` owns isolated PostgreSQL, OAuth, encryption,
  authorization, stateless transport, and cleanup proof outside
  `make perfect-fast`.
