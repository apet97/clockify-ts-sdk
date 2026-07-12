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

## Risk surfaces

| Surface | Main failure mode | Required mitigation | Proof gates |
|---|---|---|---|
| Credential handling | `CLOCKIFY_API_KEY`, `CLOCKIFY_ADDON_TOKEN`, `CLOCKIFY_WORKSPACE_ID`, or `NPM_TOKEN` leaks through docs, examples, errors, or logs. | Keep secrets in environment variables only, use token-shaped scans, and keep error/receipt paths redaction-friendly. | `make secret-hygiene`, `make env-contract`, `make observability` |
| Mock/replay base URL | `CLOCKIFY_BASE_URL` is pointed at a non-local endpoint and real credentials are sent outside Clockify or the local mock. | Document it as test-only, keep it covered by env contracts, and treat external base URLs as an operator risk. | `make env-contract`, `make mock-contract`, `make security-threat-model` |
| MCP write safety | An agent accidentally creates, updates, deletes, invoices, expenses, time off, or scheduling data without preview and confirmation. | High-risk workflow writes require `dry_run` and `confirm_token`; destructive tools advertise `destructiveHint: true`; receipts include `changed` and recovery. | `make mcp-write-safety`, `make observability`, `make live-safety` |
| CLI write safety | A script runs a destructive command against the wrong object or hides the target behind interactive prompts. | CLI writes stay non-interactive; destructive commands are ID-scoped; create/update commands return identifiers in JSON receipts. | `make cli-write-safety`, `make cli-contract`, `make observability` |
| Webhook verification | A caller treats Clockify webhook verification like HMAC or accepts unsigned events. | Keep the `Clockify-Signature-Token` shared-secret verifier documented and tested; do not invent stronger semantics than Clockify provides. | `make sdk-runtime-contract`, `make test-matrix` |
| Webhook callback SSRF | A registered callback URL points at an internal service, or a hostname rebinds to a private IP after the offline check passes. | `clockify_setup_webhook` validates callback URLs offline through `mcp/src/orchestration/webhook-url.ts`, rejecting non-HTTPS, embedded credentials, and private/loopback/link-local/CGNAT/metadata IPs. DNS rebinding is an accepted limitation of the offline guard, tracked as `webhook-url-guard-no-dns-rebinding` in the risk register. | `make security-threat-model`, `make mcp-write-safety` |
| Live proof | Concurrent or mis-scoped live tests mutate a customer workspace, expose identifiers, or leave sandbox records behind. | Require exact workspace confirmation, one stale-safe `/tmp` lock, a generated run prefix, paired cleanup, an aggregate dependency-ordered sweep, and one count-only zero-leftover receipt. | `make live-safety`, `make test-data-lifecycle`, `make perfect-live` |
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
- `make perfect-live` remains the only accepted path for live Clockify cleanup
  proof.
