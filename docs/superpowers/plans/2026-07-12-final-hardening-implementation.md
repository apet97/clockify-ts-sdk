# Clockify SDK Final Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Finish the authenticated HTTP, generated typing, MCP/CLI safety,
live sandbox, MCPB, and release-proof hardening required for SDK 0.12.0, CLI
0.3.0, and MCP 0.6.0.

**Architecture:** GOCLMCP remains the API-truth owner. This repo regenerates a
replaceable SDK core and keeps small handwritten SDK, CLI, MCP, live-proof,
and packaging seams around it. Each phase is sequential and blocks the next
phase on its exact gate.

**Tech Stack:** Node.js 22.13+, TypeScript, Vitest, Zod, Commander, MCP SDK,
npm workspaces/SBOM, Ruby and Go in GOCLMCP, GitHub Actions.

## Global Constraints

- SDK version is 0.12.0; CLI version is 0.3.0; MCP version is 0.6.0.
- Node engines are >=22.13.0 and CI proves exact 22.13.0 plus Node 24.
- Never edit output/ts-sdk, wrapper/src, or the corrected snapshot by hand.
- Never mutate a customer workspace. Live writes use only the documented
  sacrificial sandbox and must leave zero objects.
- Never run npm publish, push a version tag, or create a GitHub Release.
- Release workflow changes may not weaken the tag-only publish boundary.
- Use test-first RED, GREEN, REFACTOR cycles for behavior changes.
- Make small focused commits and stop immediately when a phase gate fails.
- Finish only by verified fast-forward to main and push GOCLMCP truth first.

---

### Task 1: Lock the authenticated HTTP regressions

**Files:**
- Modify: scripts/sdk-codegen/test-generate-sdk-from-openapi.mjs
- Modify: scripts/sdk-codegen/fixtures or inline generator fixtures
- Modify: wrapper/tests/create-client.test.ts
- Modify: wrapper/tests/composed-fetch.test.ts
- Modify: wrapper/tests/passthrough-request.test.ts

**Interfaces:**
- Consumes the current generated ClockifyApiClient.fetch and composedFetch.
- Produces failing regression coverage for the exact raw-fetch contract in the
  design spec.

- [ ] Add one focused failing case for each target/input/base-supplier,
  Request-property, header, auth, query, retry, body replay, abort, timeout,
  validation, and redirect rule in the design spec.
- [ ] Run the smallest affected Vitest or node:test command after each group.
  Confirm failure is caused by missing behavior rather than fixture/setup
  errors.
- [ ] Record RED commands and representative failures in the task report.
- [ ] Commit only tests once the complete expected RED matrix is established.

### Task 2: Implement one replay-safe request executor

**Files:**
- Modify: scripts/sdk-codegen/emitter.mjs
- Modify: scripts/sdk-codegen/schema.mjs only if option emission requires it
- Modify: wrapper/composed-fetch.ts
- Modify: wrapper/create-client.ts
- Modify: wrapper/README.md
- Update the tests from Task 1

**Interfaces:**
- Produces one generated internal executor shared by typed and passthrough
  requests.
- Produces one finalized Request template cloned for every attempt.
- Preserves the factory as a second authenticated destination boundary.

- [ ] Implement supplier resolution and per-service URL validation before auth.
- [ ] Implement finite retry and positive timeout validation.
- [ ] Implement retry methods/statuses, caller-abort versus timeout handling,
  abort-aware sleep, response-body cancellation, and fresh Request clones.
- [ ] Build raw Request templates in the exact precedence order from the spec.
- [ ] Preflight clone retryable bodies and reject non-replayable inputs before
  dispatch.
- [ ] Apply the replayability discipline to composedFetch retry opt-ins.
- [ ] Run the focused GREEN commands after each behavior group and keep all
  preceding cases green.
- [ ] Document the final raw-fetch contract and migration expectations.
- [ ] Run the Phase 1 gate:

      make sdk-codegen
      make sdk-codegen-drift
      make sdk-codegen-test
      make generator-comparison
      npm run type-check -w clockify-sdk-ts-115
      npm test -w clockify-sdk-ts-115
      npm run build -w clockify-sdk-ts-115
      npm run build:smoke -w clockify-sdk-ts-115
      npm pack --dry-run -w clockify-sdk-ts-115

- [ ] Commit the focused HTTP-boundary change. Stop if any Phase 1 command is
  red.

### Task 3: Correct GOCLMCP request and replacement schemas

**Files:**
- Modify only the owning files under ../GOCLMCP/docs/openapi/sources
- Modify: ../GOCLMCP/docs/openapi/sources/manifest.json
- Modify focused GOCLMCP schema/generator tests
- Modify: spec/evidence/discrepancies.md
- Copy after proof: spec/corrected/clockify.corrected.openapi.yaml

**Interfaces:**
- Produces generated request types for ClientUpdate.archived,
  TaskCreateRequest.billable, create-custom-field required, optional policy
  approve, time-off policy replacement state, and invoice billFrom/clientAddress.

- [ ] Add focused failing Go/schema tests for each correction.
- [ ] Change only the owning source fragments; do not touch generator merge or
  dedup logic.
- [ ] Add one atomic evidence-ledger entry per corrected discrepancy.
- [ ] Refresh only affected source-manifest hashes.
- [ ] Run in GOCLMCP:

      make gen-openapi
      make openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift
      go test ./internal/tools/...
      git diff --check

- [ ] Commit GOCLMCP API truth before copying its proven canonical OpenAPI into
  this repo.
- [ ] Regenerate downstream SDK output from the copied snapshot.

### Task 4: Replace sparse writes and open payload escapes

**Files:**
- Modify focused helpers in wrapper/ensure.ts, wrapper/invoice-body.ts, or new
  small operation-specific builder modules only when shared by consumers
- Modify affected cli/src/commands files
- Modify affected mcp/src/tools and mcp/src/tools/workflows files
- Add/modify focused wrapper, CLI, and MCP tests

**Interfaces:**
- Produces pure typed builders and full-replacement reconstruction for clients,
  tasks, expense categories, custom fields, webhooks, invoices, and time-off
  policies.

- [ ] For each replacement write, add a failing test that proves current state
  is fetched, required fields are validated, false/zero/empty values survive,
  only supplied fields overlay, no-op updates reject, and mutation is not
  called when reconstruction fails.
- [ ] Implement the smallest typed builder or local reconstruction needed for
  each resource. Never invent missing defaults.
- [ ] Preserve task rollback names, editable client fields, all five webhook
  fields, complete invoice replacement state, and explicit time-off DTO-to-
  request conversion.
- [ ] Add strict operation-specific Zod schemas for reports, expense/shared
  reports, invoice import, entries, expenses, scheduling, time off, projects/
  work packages, webhooks, and rates.
- [ ] Assign protected scope/ID/date/paging/trigger/filter fields after
  validated extras.
- [ ] Preserve the plan's compatibility decisions for expense filtering,
  webhook list query parameters, empty time-off note, pinned webhook scope, and
  explicit report dates/filters.

### Task 5: Remove wireBody completely

**Files:**
- Modify/delete relevant contents in wrapper/requests.ts
- Modify: wrapper/index.ts
- Modify: docs/sdk-public-api.json
- Modify: wrapper/scripts/verify-dual-build.sh
- Modify: scripts/check-consumer-cast-budget.mjs
- Modify affected current docs, tests, CLI, and MCP imports/calls
- Modify: docs/migration-guide.md
- Modify package changelogs

**Interfaces:**
- Preserves ClockifyApi, ClockifyRequestBody, AUDIT_LOG_ACTIONS, and
  AuditLogAction on the requests subpath.
- Removes wireBody from all current runtime/public/test/doc surfaces.

- [ ] Temporarily tighten wireBody to wireBody<T extends object>(value: T): T
  and run type-check to expose each mismatch.
- [ ] Migrate direct unwraps first, then schema/builder corrections.
- [ ] Delete the helper, tests, exports, governance, and smoke expectations.
- [ ] Make the consumer-cast gate reject any future wireBody identifier.
- [ ] Add migration examples for typed flattened and body-envelope requests.
- [ ] Require this search to return no current runtime/export/test/doc hits:

      rg -n "wireBody" wrapper cli mcp

- [ ] Run the Phase 2 gate:

      npm run type-check
      npm test
      npm run build
      make sdk-codegen-drift sdk-codegen-test codegen-determinism
      make generator-comparison build-determinism
      make pack-smoke pack-snapshot-check
      git diff --check

- [ ] Commit the downstream typed migration. Stop if any Phase 2 command is red.

### Task 6: Centralize MCP risk registration and exact previews

**Files:**
- Modify: mcp/src/result.ts or add one focused registration module
- Modify: mcp/src/orchestration/confirmation.ts
- Modify: mcp/src/orchestration/confirm-guard.ts
- Modify: mcp/src/server.ts
- Modify: docs/mcp-write-safety-contract.json
- Add/modify focused MCP registration and confirmation tests

**Interfaces:**
- Produces ToolRisk, defineTool, defineGuardedTool, runtime risk metadata, and
  exact stored-preview execution.

- [ ] Add failing type/runtime tests for allowed helper risk classes,
  annotations, metadata, and direct-registration prohibition.
- [ ] Add failing matrix tests for neither/both controls, dry run, exact stored
  execution, expiry, reuse, tampering, cross-tool/workspace/risk, changed args,
  and failed-execute token consumption.
- [ ] Implement canonical clone/hash storage with five-minute one-use entries.
- [ ] Keep entity resolution and webhook URL validation inside preview.
- [ ] Run focused MCP tests until the complete matrix is green.

### Task 7: Classify and migrate all 140 MCP tools

**Files:**
- Modify every mcp/src/tools registration site
- Modify: docs/mcp-tools.json and generated manifest surfaces
- Modify: scripts/check-mcp-write-safety.mjs
- Modify MCP server/manifest/write-safety tests and mcp/README.md

**Interfaces:**
- Produces exactly 58 read, 26 routine_write, 30 business_write, 5
  external_side_effect, 3 privileged, and 18 destructive tools.
- Produces exactly 56 guarded tools and 140 classified tools.

- [ ] Classify each tool once and migrate all non-read/routine risks to
  defineGuardedTool preview/execute handlers.
- [ ] Keep routine timer/tag/project/client/task/entry and approved routine
  membership/profile/custom-field-association writes one-call.
- [ ] Guard every high-impact family listed in the design spec, including role
  grant/revoke and all delete/remove paths.
- [ ] Replace marker/source safety checks with live registration assertions.
- [ ] Run MCP Phase 3 commands:

      npm run type-check -w @apet97/clockify-mcp-115
      npm test -w @apet97/clockify-mcp-115
      make mcp-tool-manifest-drift mcp-write-safety mcp-contract

### Task 8: Classify CLI leaves and prove all mutation handlers

**Files:**
- Add or modify one CLI command-metadata/registry module
- Modify: cli/src/index.ts
- Modify all cli/src/commands registrars
- Replace marker tests with Commander-tree and behavioral tests
- Modify CLI contracts and README/changelog as generated

**Interfaces:**
- Produces leafCommand, 57 exactly-once classifications, injectable buildProgram
  and main, and a strict fake-client recorder.

- [ ] Add failing tree tests for duplicate, grouping-node, missing, and exact
  risk-distribution behavior.
- [ ] Pin stop and expenses create as write and raw api as destructive.
- [ ] Add Services injection without changing default production behavior.
- [ ] For each of 30 mutating leaves, add one successful invocation and one
  sentinel failure invocation with ordered-call and output assertions.
- [ ] Run CLI Phase 3 commands:

      npm run type-check -w @apet97/clockify-cli-115
      npm test -w @apet97/clockify-cli-115
      make cli-write-safety cli-contract

- [ ] Commit Phase 3 only after both MCP and CLI gates are green. Stop on red.

### Task 9: Build the live orchestrator and cleanup library

**Files:**
- Add a root live orchestrator under scripts
- Add a focused cleanup library and unit tests
- Modify wrapper/tests/sandbox.test.ts
- Modify cli/tests/sandbox.test.ts
- Modify mcp/tests/sandbox.test.ts
- Modify live/test-data contract scripts and docs

**Interfaces:**
- Produces one locked run prefix, four independently retained suite results,
  deterministic finally cleanup, and one sanitized final JSON receipt.

- [ ] Add unit tests for lock acquisition/stale handling, prefix creation,
  independent suite result retention, finally cleanup, sanitization, and
  nonzero exit rules.
- [ ] Add a committed non-reversible sacrificial-workspace fingerprint check;
  a successful API request or merely populated environment values must not
  authorize mutation.
- [ ] Add fake-SDK cleanup tests for all eleven entity classes in dependency
  order and count receipts.
- [ ] Expand wrapper, CLI, and MCP live round trips exactly as the design spec
  requires, with try/finally and run-prefix naming.
- [ ] Enforce only feature_unavailable or HTTP 402 as entitlement skips.
- [ ] Wire cli-write-safety, mcp-write-safety, live-safety, and
  test-data-lifecycle into aggregate phases and tracked-state checks.
- [ ] Run:

      make live-safety test-data-lifecycle
      node scripts/verify.mjs live

- [ ] Require wrapper/CLI/MCP/GOCLMCP results plus cleanup and leftovers: 0 in
  the sanitized receipt. Stop on red or residue.

### Task 10: Derive versions and build exact MCPB/SPDX artifacts

**Files:**
- Modify wrapper/package.json, cli/package.json, mcp/package.json, package-lock.json
- Modify release-please manifests/config
- Modify MCP manifest and generated version constants
- Modify changelogs, migration guide, product surface, and package docs
- Modify/add MCPB build, hash, SBOM, and extraction-smoke scripts/tests

**Interfaces:**
- Produces versions 0.12.0/0.3.0/0.6.0 and SDK peer range >=0.12.0 <1.
- Produces exact MCPB and SPDX filenames from manifest versions.

- [ ] Add failing version-consistency tests for every manifest/runtime surface.
- [ ] Remove all runtime version literals in favor of generated constants.
- [ ] Add failing MCPB stage/archive/extraction/security/surface/hash/SBOM tests.
- [ ] Build from a fresh production install, audit it, generate SPDX, compute
  exact hashes/sizes into a sanitized stdout JSON receipt, and reject stale
  wildcard bundle selection. Do not create a third release artifact.
- [ ] Require extracted initialize, tools/list, resources/list, prompts/list,
  140 tool-name parity, six resources, two prompts, and clean shutdown.

### Task 11: Harden proof-only release workflow and finish integration

**Files:**
- Modify: .github/workflows/ci-mcp-release.yml
- Modify CI/runtime/release contracts and docs
- Modify aggregate verification only where required by the design

**Interfaces:**
- Preserves tag-only npm publication and makes workflow_dispatch proof-only.
- Produces exact Node/action/version/peer/audit/MCPB/SBOM proof ordering.

- [ ] Add failing static/workflow contract tests before changing the workflow.
- [ ] Use exact Node 22.13.0, SHA-pinned actions, version/tag/peer checks, full
  generation/MCP gates, both audits, extraction smoke, secret scan, SPDX/hash
  proof, then publish only on a valid tag push.
- [ ] Attach exact artifact paths idempotently only in tag release execution.
- [ ] Prove the cycle locally without publishing:

      node scripts/verify.mjs fast
      node scripts/verify.mjs full
      node scripts/verify.mjs release
      npm audit --json
      npm audit --omit=dev --json
      git diff --check
      make mutation

- [ ] If local mutation is unsafe under load, dispatch the manual Mutation
  workflow on the implementation branch and require wrapper >=82 and MCP >=71.
- [ ] Perform security-focused whole-branch review and scan for wireBody,
  missing classification, runtime version literals, credential CLI options,
  unguarded high-impact writes, and generated-path edits.
- [ ] Verify both repos clean, fetch both origins, require zero divergence, and
  fast-forward main. Push GOCLMCP first, SDK second, then watch all Actions.
- [ ] Fix forward only for change-caused failures. Do not publish, tag, or
  create a release.
- [ ] Update the existing Obsidian project note with commits, verification,
  live limitations, zero leftovers, and an explicit no-publish statement.
