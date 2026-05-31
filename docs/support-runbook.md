# Support Runbook

This runbook defines the safe diagnostic bundle for SDK, CLI, MCP, OpenAPI,
mock/replay, and live-proof issues. It is written for operators who do not want
to debug by reading source code, and for future agents that need exact evidence
without accidentally collecting secrets.

## Safe diagnostic bundle

Collect these items before escalating an issue:

- Package surface: SDK, CLI, MCP, or OpenAPI/generator.
- Package name and version: `clockify-sdk-ts-115`, `@clockify115/cli`, or
  `@clockify115/mcp-server`.
- Prepublish gate: the exact `prepublishOnly` command when packaging,
  tarball, or publish-readiness behavior is relevant.
- Runtime: Node version, package-lock version/package count, operating system,
  and whether local SDK codegen was involved. The generated support
  bundle does not run `npm --version`; add a sanitized npm version manually only
  when it is relevant.
- Command or API path: the exact command, import path, MCP tool name, or
  OpenAPI operation ID.
- Sanitized receipt: include request IDs (`requestId`), `status`, stable error `code`, `retryable`, `recovery`, `changed`, and `next` when present.
- Environment shape: which variables were set by name only, such as
  `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, `CLOCKIFY_BASE_URL`, or
  `CLOCKIFY_ADDON_TOKEN`.
- Proof attempted: the narrowest relevant command, such as
  `make receipt-examples`, `make troubleshooting`, `make mock-contract`, or a
  package test command.

## Generated support bundle command

For a first-pass escalation packet, run:

```bash
node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json
```

The command is intentionally no-network and metadata-only. It reads package
manifests plus committed contract files, then writes a JSON packet with runtime
shape, package names and versions, package-lock metadata, diagnostics
entrypoints, safe command hints, prepublish gates, final-readiness blocker
summaries, risk routing, ordered proof-chain coverage, and redaction guarantees. The
package-lock metadata is summary-only: path, availability, lockfile version, and
package count. It does not include dependency names, resolved tarball URLs,
integrity hashes, or `node_modules` entries. It does not run tests, contact
Clockify, call Git, run `npm --version`, read `.env` files, read shell history,
collect raw logs, or capture environment variable values.

`make support-bundle` builds this packet in memory and checks the generated
shape, including `network: "none"`, empty `commandsExecuted`, false redaction
capture flags, summary-only package-lock fields, and compact `readinessContext`
fields from the no-network enterprise-goal, release-readiness, risk-status, and
contract-inventory reports.

Review the JSON before attaching it anywhere. Add only sanitized receipts by
hand, and keep production payloads, customer workspace identifiers, token
values, browser cookies, npm auth files, and live probe captures out of the
bundle.

## Quickstart and diagnostics handoff

Before escalating first-run setup confusion, run or cite `make quickstart-receipt`
and capture which no-network diagnostic surface was used: `clockifyDiagnostics()`,
`clk115 doctor --json`, or `clockify://mcp/doctor`. The generated support bundle
includes these diagnostic entrypoints with `network: "none"` and safe command
hints so the next operator can distinguish local readiness, mock proof, and live
sandbox proof without reading source code. Deferred live proof is not final readiness; record it as a draft blocker until `make perfect-live` runs cleanly.

For setup, auth, runtime, or support handoff uncertainty, start with:

```bash
node scripts/plan.mjs workflow --workflow first-run-support
```

That workflow is a map, not proof. It keeps the support path no-network, points
to `safeCommandHints`, and prevents a first-run issue from jumping straight to
live Clockify calls, raw logs, or package publication.

## Never include

Never paste or attach these values in support tickets, issue comments, chat, or
handoff files:

- Raw `CLOCKIFY_API_KEY`, `CLOCKIFY_ADDON_TOKEN`, `NPM_TOKEN`, or GitHub token
  values.
- Customer workspace names, user emails, private client names, invoice line
  details, webhook secrets, or production object payloads.
- Full live probe captures from `spec/evidence/probes/`; promote only the
  sanitized finding into `spec/evidence/discrepancies.md`.
- Browser cookies, shell history, local `.env` files, npm auth files, or CI
  secret configuration.

## SDK support checklist

1. Identify the public import path and package version.
2. Capture whether the call used `createClockifyClient`, `withResponse`,
   `composedFetch`, pagination helpers, webhook helpers, or error helpers.
3. Include the sanitized `requestId`, `status`, stable error `code`,
   `retryable`, and `recovery` fields when available.
4. If pagination is involved, include page size, stopping condition, and whether
   the `Last-Page` header was observed.
5. If webhook verification is involved, include only whether the
   `Clockify-Signature-Token` matched; never include the shared secret.

## CLI support checklist

1. Include the exact `clk115` command and whether `--json` was used.
2. Include the exit code and sanitized JSON output.
3. For write commands, include the explicit object ID or generated ID, plus the
   `changed` field when present.
4. For configuration issues, list variable names that were set, not values.
5. If `CLOCKIFY_BASE_URL` was set, state whether it pointed at the local mock
   server or a real Clockify endpoint.

## MCP support checklist

1. Include the MCP tool name, input shape with secrets removed, and whether the
   tool was a workflow or domain tool.
2. Include `structuredContent.ok`, `changed`, `warnings`, `next`, stable error
   `code`, `retryable`, and `recovery`.
3. For high-risk writes, include whether `dry_run` was used and whether a
   `confirm_token` was required.
4. Include MCP resources or prompts used, such as `clockify://guide/safety` or
   `clockify-workflow-plan`.
5. For live cleanup failures, include only the cleanup prefix, leftover count,
   and sanitized object IDs.

## OpenAPI and generator support checklist

1. Identify whether the issue belongs in GOCLMCP source generation,
   the local SDK generator, wrapper ergonomics, CLI behavior, or MCP behavior.
2. Do not hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or
   `wrapper/src/**` to work around the issue.
3. Link the relevant discrepancy entry from `spec/evidence/discrepancies.md` or
   add one before changing shape.
4. For generator issues, include the OpenAPI operation ID, tag, path, method,
   SDK method stamp, and whether `make openapi-lint` or
   `make generator-comparison` was attempted.
5. For local generator issues, include the generator command, Node version,
   OpenAPI operation ID, and sanitized error text.

## Live proof escalation

Live proof can mutate Clockify state. Escalate live failures with:

- Confirmation that the workspace is sacrificial, not a customer workspace.
- The command that ran, such as `make perfect-live` or package live
  cleanup verification.
- Cleanup prefix, leftover count, and sanitized IDs.
- Whether live proof is completed, or whether the current receipt is still a
  draft with a concrete deferral reason. Deferred live proof is not final
  readiness.

Do not claim live readiness from partial green output. Trust the final cleanup
receipt and leftover count.

## Redaction rules

- Keep the first and last two characters of an ID only when needed for human
  correlation; otherwise use role labels like `workspace_123` or `entry_123`.
- Replace secrets with `<redacted>` before storing logs in docs, issues, or
  handoff files.
- Prefer stable receipts over raw HTTP bodies.
- If unsure whether a value is sensitive, omit it and describe its role.

## Escalation template

```md
Surface: SDK | CLI | MCP | OpenAPI/generator
Package/version:
Prepublish gate:
Runtime:
Package-lock:
Command/tool/import/operation:
Sanitized receipt:
Request ID:
Stable error code:
Retryable:
Recovery shown:
Changed:
Live workspace type: none | sacrificial sandbox | unknown
Proof attempted:
What changed recently:
What must not be retried automatically:
```
