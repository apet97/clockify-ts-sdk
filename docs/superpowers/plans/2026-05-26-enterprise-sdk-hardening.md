# Enterprise SDK Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo's SDK, CLI, MCP, OpenAPI generation, docs, and package proof feel like a polished SDK platform without buying a generator vendor.

**Architecture:** Keep GOCLMCP as the canonical API truth, keep Fern output replaceable, and move repeated package/docs/tool facts into machine-readable metadata plus root-level gates. Build deterministic local proof first, then live sandbox proof.

**Tech Stack:** Make, Node.js built-ins, npm pack, TypeScript package scripts, Fern CLI, GOCLMCP Go Makefile gates, MCP structured outputs.

---

## File structure

- Create: `Makefile` for root orchestration.
- Create: `scripts/generate-product-surface.mjs` for machine-readable surface metadata and generated markdown.
- Create: `scripts/check-no-generated-edits.mjs` for generated-path discipline.
- Create: `scripts/pack-consumer-smoke.mjs` for tarball consumer proof.
- Create: `scripts/mock-clockify-server.mjs` for deterministic API tests.
- Create: `docs/axioms.md` for durable product rules.
- Create: `docs/quality-gates.md` for non-coder command operation.
- Create: `docs/product-surface.json` and `docs/product-surface.md` as generated metadata outputs.
- Create: `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` as temporary continuation state.
- Later modify: `wrapper/tests`, `cli/tests`, and `mcp/tests` to consume the mock server.
- Later create: `docs/error-codes.json` and generator scripts for SDK/CLI/MCP error docs.

### Task 1: Root command surface

**Files:**
- Create: `Makefile`
- Create: `docs/quality-gates.md`

- [x] **Step 1: Add root targets**

```make
perfect-fast: generated-edit-check product-surface-drift docs-drift wrapper-gates cli-gates mcp-gates
perfect-full: goclmcp-drift fern-check fern-generate perfect-fast pack-smoke
perfect-live:
	cd mcp && npm run verify:live-cleanup
```

- [x] **Step 2: Document exact commands**

```markdown
| Goal | Command | What it proves |
|---|---|---|
| Fast deterministic proof | `make perfect-fast` | Guarded generated paths are clean, product surface metadata is current, docs do not contain known stale markers, and SDK/CLI/MCP package gates pass. |
```

### Task 2: Product axioms and context retention

**Files:**
- Create: `docs/axioms.md`
- Create: `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md`

- [x] **Step 1: Add axioms**

```markdown
1. One truth source beats three clever layers.
2. Generated code is a dependency, not the product.
3. Every public surface needs a receipt.
```

- [x] **Step 2: Add temporary context file**

```markdown
Remove this file after the enterprise SDK/CLI/MCP polish goal is fully implemented, verified, and summarized in permanent docs.
```

### Task 3: Product surface metadata

**Files:**
- Create: `scripts/generate-product-surface.mjs`
- Create: `docs/product-surface.json`
- Create: `docs/product-surface.md`

- [x] **Step 1: Generate package and workflow metadata from stable sources**

```bash
node scripts/generate-product-surface.mjs --write
```

- [x] **Step 2: Add drift gate**

```bash
node scripts/generate-product-surface.mjs --check
```

### Task 4: Generated edit guard

**Files:**
- Create: `scripts/check-no-generated-edits.mjs`

- [x] **Step 1: Block accidental diffs in generated/snapshot paths**

```bash
node scripts/check-no-generated-edits.mjs
```

Expected success output:

```text
no guarded generated/snapshot edits detected
```

### Task 5: Packed consumer proof

**Files:**
- Create: `scripts/pack-consumer-smoke.mjs`

- [x] **Step 1: Pack SDK, CLI, and MCP**

```bash
node scripts/pack-consumer-smoke.mjs
```

Expected success output:

```text
packed consumer smoke passed for SDK, CLI, and MCP
```

### Task 6: Mock/replay foundation

**Files:**
- Create: `scripts/mock-clockify-server.mjs`
- Create: `scripts/mock-clockify-server.d.mts`
- Create: `wrapper/tests/mock-clockify.test.ts`
- Create: `cli/tests/mock-clockify.test.ts`
- Create: `mcp/tests/mock-clockify.test.ts`
- Modify: `cli/src/config.ts`
- Modify: `cli/src/client.ts`
- Modify: `cli/src/index.ts`
- Modify: `mcp/src/client.ts`

- [x] **Step 1: Add local mock server**

```bash
CLOCKIFY_MOCK_PORT=45881 node scripts/mock-clockify-server.mjs
```

Expected startup output:

```text
Mock Clockify server listening on http://127.0.0.1:45881
```

- [x] **Step 2: Add SDK tests against the mock server**

```typescript
import { describe, expect, it } from "vitest";
import { createClockifyClient, iterAll } from "../index";

describe("mock Clockify server", () => {
    it("walks paginated tags through iterAll", async () => {
        const client = createClockifyClient({ apiKey: "mock", baseUrl: "http://127.0.0.1:45881/api/v1" });
        const tags = [];
        for await (const tag of iterAll(client.tags.list.bind(client.tags), { workspaceId: "000000000000000000000001" })) {
            tags.push(tag.name);
        }
        expect(tags).toContain("Deep Work");
    });
});
```

- [x] **Step 3: Add CLI tests against the mock server**

```typescript
import { describe, expect, it } from "vitest";

describe("CLI mock Clockify server", () => {
    it("prints status in json mode", async () => {
        const result = await runCli(["--json", "status"], {
            CLOCKIFY_API_KEY: "mock",
            CLOCKIFY_WORKSPACE_ID: "000000000000000000000001",
            CLOCKIFY_BASE_URL: "http://127.0.0.1:45881/api/v1",
        });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).ok).toBe(true);
    });
});
```

- [x] **Step 4: Add MCP tests against the mock server**

```typescript
import { describe, expect, it } from "vitest";

describe("MCP mock Clockify server", () => {
    it("returns a structured status receipt", async () => {
        const response = await callTool("clockify_status", {}, {
            CLOCKIFY_API_KEY: "mock",
            CLOCKIFY_WORKSPACE_ID: "000000000000000000000001",
            CLOCKIFY_BASE_URL: "http://127.0.0.1:45881/api/v1",
        });
        expect(response.structuredContent.ok).toBe(true);
        expect(response.structuredContent.meta.workspaceId).toBe("000000000000000000000001");
    });
});
```

### Task 7: Shared error and recovery registry

**Files:**
- Create: `docs/error-codes.json`
- Create: `docs/error-codes.md`
- Create: `scripts/generate-error-docs.mjs`
- Create: `wrapper/error-codes.ts`
- Create: `cli/src/error-codes.ts`
- Create: `mcp/src/error-codes.ts`
- Modify: `wrapper/errors.ts`
- Modify: `wrapper/index.ts`
- Modify: `wrapper/tsconfig.json`
- Modify: `wrapper/tsconfig.esm.json`
- Modify: `wrapper/tsconfig.cjs.json`
- Modify: `wrapper/scripts/verify-dual-build.sh`
- Modify: `cli/src/output.ts`
- Modify: `mcp/src/result.ts`

- [x] **Step 1: Create registry**

```json
{
  "schemaVersion": 1,
  "codes": [
    { "code": "invalid_request", "http": [400], "retry": false, "recovery": "Fix request fields and retry." },
    { "code": "auth_or_permission", "http": [401, 403], "retry": false, "recovery": "Check token, workspace, and permissions." },
    { "code": "rate_limited", "http": [429], "retry": true, "recovery": "Wait for Retry-After or X-RateLimit-Reset." }
  ]
}
```

- [x] **Step 2: Generate SDK/CLI/MCP docs from registry**

```bash
node scripts/generate-error-docs.mjs --write
```

- [x] **Step 3: Generate TypeScript constants for runtime adoption**

```typescript
export const CLOCKIFY_ERROR_CODES = {
    invalid_request: {
        retry: false,
        recovery: "Fix request fields and retry.",
    },
    rate_limited: {
        retry: true,
        recovery: "Wait for Retry-After or X-RateLimit-Reset.",
    },
} as const;
```

- [x] **Step 4: Wire CLI JSON errors and MCP envelopes to the generated registry**

```typescript
const code = errorCodeForMessage(message);
const envelope = { ok: false, action, error: { code, message } };
```

- [x] **Step 5: Re-export SDK error-code helpers through the existing errors surface**

```typescript
export {
    CLOCKIFY_ERROR_CODES,
    errorCodeForStatus,
    recoveryForCode,
} from "./error-codes.js";
```

- [x] **Step 6: Add SDK runtime recovery classification**

```typescript
const classified = classifyClockifyError(err);
if (classified?.code === "rate_limited" && classified.retryable) {
    // back off, then retry
}
```

### Task 8: Operation-level parity matrix

**Files:**
- Create: `scripts/generate-openapi-operations.mjs`
- Create: `scripts/generate-operation-parity.mjs`
- Create: `docs/openapi-operations.json`
- Create: `docs/openapi-operations.md`
- Create: `docs/operation-parity-overrides.json`
- Create: `docs/operation-parity.json`
- Create: `docs/operation-parity.md`
- Later modify: `scripts/generate-product-surface.mjs`
- Later update: `docs/product-surface.json`
- Later update: `docs/product-surface.md`

- [x] **Step 1: Generate corrected OpenAPI operation inventory**

```bash
node scripts/generate-openapi-operations.mjs --write
```

- [x] **Step 2: Join product metadata with OpenAPI operations and MCP tool catalogs**

```json
{
  "operationId": "listTags",
  "sdk": "client.tags.list",
  "cli": "clk115 tags list",
  "tsMcp": "clockify_tags_list",
  "goMcp": "clockify_tags_list",
  "tests": ["wrapper/tests/iter.test.ts", "cli/tests/sandbox.test.ts", "mcp/tests/sandbox.test.ts"]
}
```

- [x] **Step 3: Curate hard mappings that cannot be inferred mechanically**

```json
{
  "operationId": "generateDetailedReportV1",
  "sdk": "client.reports.detailed",
  "goMcp": "clockify_reports_detailed",
  "tsMcp": null,
  "reason": "Reports remain GOCLMCP/raw-fallback territory for now."
}
```

### Task 9: OpenAPI lint and generator independence

**Files:**
- Create: `docs/generator-config-contract.json`
- Create: `scripts/check-generator-config.mjs`
- Create: `scripts/lint-openapi-contract.mjs`
- Create: `scripts/check-generator-independence.mjs`
- Create: `scripts/check-generator-comparison.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Add corrected OpenAPI contract lint**

```bash
node scripts/lint-openapi-contract.mjs
```

- [x] **Step 2: Add generator configuration pin check**

```bash
node scripts/check-generator-config.mjs
```

- [x] **Step 3: Add generator-independence check**

```bash
node scripts/check-generator-independence.mjs
```

- [x] **Step 4: Add generator comparison harness**

```bash
node scripts/check-generator-comparison.mjs
```

### Task 10: Generated README tables

**Files:**
- Create: `docs/cli-commands.json`
- Create: `docs/mcp-tools.json`
- Create: `scripts/update-readme-tables.mjs`
- Modify: `cli/README.md`
- Modify: `mcp/README.md`
- Modify: `Makefile`

- [x] **Step 1: Replace manual command/tool tables with generated blocks**

```markdown
<!-- BEGIN generated:cli-commands -->
<!-- END generated:cli-commands -->
```

- [x] **Step 2: Gate drift**

```bash
node scripts/update-readme-tables.mjs --check
```

### Task 11: CLI JSON, exit-code, and completion contract

**Files:**
- Create: `cli/src/completions.ts`
- Create: `cli/tests/completions.test.ts`
- Create: `cli/tests/exit-contract.test.ts`
- Modify: `cli/src/index.ts`
- Modify: `cli/src/output.ts`
- Modify: `cli/CHANGELOG.md`

- [x] **Step 1: Add exit-code contract tests**

```typescript
expect(await main(["node", "clk115", "--json", "--bad"])).toBe(2);
expect(await main(["node", "clk115", "--json", "status"])).toBe(1);
expect(await main(["node", "clk115", "--version"])).toBe(0);
```

- [x] **Step 2: Return `2` for commander usage errors**

```typescript
return isCommanderUsageError(err) ? 2 : 1;
```

- [x] **Step 3: Add shell completion generation**

```bash
clk115 completion zsh
clk115 completion bash
clk115 completion fish
```

### Task 12: Changelog, docs index, and performance gates

**Files:**
- Create: `cli/CHANGELOG.md`
- Create: `docs/README.md`
- Create: `docs/install-personas.md`
- Create: `docs/migration-guide.md`
- Create: `docs/dependency-policy.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/performance-budgets.json`
- Create: `scripts/check-changelog-entry.mjs`
- Create: `scripts/check-doc-index.mjs`
- Create: `scripts/generate-troubleshooting.mjs`
- Create: `scripts/check-performance-budgets.mjs`
- Modify: `Makefile`

- [x] **Step 1: Add package changelog coverage gate**

```bash
node scripts/check-changelog-entry.mjs
```

- [x] **Step 2: Add built artifact size/startup budgets**

```bash
node scripts/check-performance-budgets.mjs
```

- [x] **Step 2a: Add budget receipt mode for calibration**

```bash
make performance-receipt
```

- [x] **Step 3: Add documentation index drift check**

```bash
node scripts/check-doc-index.mjs
```

- [x] **Step 4: Add operator install, migration, dependency, and troubleshooting docs**

```bash
make troubleshooting
```

### Task 13: MCP output schema contract

**Files:**
- Create: `mcp/src/output-schema.ts`
- Modify: `mcp/src/server.ts`
- Modify: `mcp/tests/server.test.ts`

- [x] **Step 1: Define the shared MCP result output schema**

```typescript
export const MCP_RESULT_OUTPUT_SCHEMA = z.object({
    ok: z.boolean(),
    action: z.string(),
}).passthrough();
```

- [x] **Step 2: Install the schema on every registered tool**

```typescript
installDefaultOutputSchema(server);
```

- [x] **Step 3: Add a regression test for advertised output schemas**

```typescript
const missingOutputSchema = tools.filter((tool) => !tool.outputSchema).map((tool) => tool.name);
expect(missingOutputSchema).toEqual([]);
```

### Task 14: MCP resources and prompts

**Files:**
- Create: `mcp/src/resources.ts`
- Create: `mcp/src/prompts.ts`
- Modify: `mcp/src/server.ts`
- Modify: `mcp/tests/server.test.ts`
- Modify: `mcp/README.md`
- Modify: `mcp/CHANGELOG.md`

- [x] **Step 1: Register MCP-native guide resources**

```typescript
server.registerResource("clockify-workflows", "clockify://guide/workflows", metadata, handler);
```

- [x] **Step 2: Register a workflow-planning prompt**

```typescript
server.registerPrompt("clockify-workflow-plan", metadata, handler);
```

- [x] **Step 3: Add server contract coverage**

```typescript
expect(resources.resources.map((resource) => resource.uri)).toContain("clockify://guide/workflows");
expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-workflow-plan");
```

### Task 15: Artifact-level completion audit

**Files:**
- Create: `docs/enterprise-hardening-audit.json`
- Create: `scripts/check-enterprise-hardening.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Map each hardening requirement to concrete evidence**

```json
{
  "id": "shared-errors",
  "evidence": [
    { "path": "docs/error-codes.json", "contains": ["rate_limited"] }
  ]
}
```

- [x] **Step 2: Add a focused artifact audit command**

```bash
make enterprise-audit
```

### Task 15a: Public package contract

**Files:**
- Create: `docs/package-contract.json`
- Create: `scripts/check-package-contract.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot package manifest contract**

```json
{
  "name": "clockify-sdk-ts-115",
  "exportKeys": [".", "./create-client"]
}
```

- [x] **Step 2: Add manifest contract gate**

```bash
make package-contract
```

### Task 15b: Runnable examples contract

**Files:**
- Create: `docs/examples-contract.json`
- Create: `scripts/check-examples-contract.mjs`
- Modify: `wrapper/examples/*.ts`
- Modify: `wrapper/examples/README.md`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Normalize examples to the actual package name**

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";
```

- [x] **Step 2: Add runnable examples contract gate**

```bash
make examples-contract
```

### Task 15c: Runtime support contract

**Files:**
- Create: `docs/runtime-support.json`
- Create: `scripts/check-runtime-support.mjs`
- Modify: `cli/package.json`
- Modify: `mcp/package.json`
- Modify: `docs/dependency-policy.md`
- Modify: `mcp/README.md`
- Modify: `Makefile`

- [x] **Step 1: Align package engines to the SDK runtime floor**

```json
{ "engines": { "node": ">=20" } }
```

- [x] **Step 2: Add runtime support drift gate**

```bash
make runtime-support
```

### Task 15d: Environment/configuration contract

**Files:**
- Create: `docs/env-contract.json`
- Create: `scripts/check-env-contract.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot env/config variables by surface**

```json
{
  "name": "CLOCKIFY_BASE_URL",
  "surfaces": ["cli", "mcp", "mock-replay"]
}
```

- [x] **Step 2: Add env/config contract gate**

```bash
make env-contract
```

### Task 15e: SDK public API contract

**Files:**
- Create: `docs/sdk-public-api.json`
- Create: `scripts/check-sdk-public-api.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot root symbols and subpaths**

```json
{
  "rootSymbols": ["createClockifyClient", "classifyClockifyError"],
  "subpaths": { "./errors": ["RateLimitError"] }
}
```

- [x] **Step 2: Add public API contract gate**

```bash
make sdk-public-api
```

### Task 15f: Version and changelog policy

**Files:**
- Create: `docs/version-policy.json`
- Create: `scripts/check-version-policy.mjs`
- Modify: `cli/CHANGELOG.md`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Add missing CLI version anchor**

```markdown
## [0.1.0] - 2026-05-26
```

- [x] **Step 2: Add version policy gate**

```bash
make version-policy
```

### Task 15g: Secret hygiene scanner

**Files:**
- Create: `docs/secret-hygiene.json`
- Create: `scripts/check-secret-hygiene.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Add lightweight committed-secret policy**

```json
{
  "patterns": [{ "id": "clockify-api-key-assignment" }]
}
```

- [x] **Step 2: Add source/docs secret hygiene gate**

```bash
make secret-hygiene
```

### Task 15g.1: Dependency boundary contract

**Files:**
- Create: `docs/dependency-boundary.json`
- Create: `scripts/check-dependency-boundary.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot runtime dependency boundaries**

```json
{
  "runtimeDependencies": ["commander"],
  "peerDependencies": { "clockify-sdk-ts-115": ">=0.9.0" }
}
```

- [x] **Step 2: Add dependency boundary gate**

```bash
make dependency-boundary
```

### Task 15h: MCP discoverability contract

**Files:**
- Create: `docs/mcp-contract.json`
- Create: `scripts/check-mcp-contract.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot MCP discoverability invariants**

```json
{
  "totalTools": 105,
  "resources": ["clockify://guide/workflows"],
  "prompts": ["clockify-workflow-plan"]
}
```

- [x] **Step 2: Add MCP contract gate**

```bash
make mcp-contract
```

### Task 15i: CLI command contract

**Files:**
- Create: `docs/cli-contract.json`
- Create: `scripts/check-cli-contract.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot CLI command/global/completion invariants**

```json
{
  "commandCount": 27,
  "globalFlags": ["--api-key", "--workspace", "--base-url", "--json"]
}
```

- [x] **Step 2: Add CLI contract gate**

```bash
make cli-contract
```

### Task 15j: Test matrix contract

**Files:**
- Create: `docs/test-matrix-contract.json`
- Create: `scripts/check-test-matrix-contract.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot required package scripts and test files**

```json
{
  "requiredScripts": ["type-check", "test", "build"],
  "requiredTests": ["wrapper/tests/mock-clockify.test.ts"]
}
```

- [x] **Step 2: Add test matrix structure gate**

```bash
make test-matrix
```

### Task 15k: Mock Clockify contract

**Files:**
- Create: `docs/mock-clockify-contract.json`
- Create: `scripts/check-mock-clockify-contract.mjs`
- Modify: `Makefile`
- Modify: `docs/quality-gates.md`

- [x] **Step 1: Snapshot deterministic mock routes and test surfaces**

```json
{
  "requiredRoutes": ["GET /user", "GET /workspaces/{workspaceId}/tags"]
}
```

- [x] **Step 2: Add mock contract gate**

```bash
make mock-contract
```

### Task 16: Final completion audit

**Files:**
- Modify: `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md`
- Create: `docs/final-proof-runbook.md`
- Create: `docs/final-proof-receipt.template.md`
- Create: `scripts/check-final-proof-receipt.mjs`
- Modify: `scripts/check-enterprise-hardening.mjs`

- [x] **Step 0: Add final proof runbook and receipt template**

```bash
make final-proof-final
```

- [x] **Step 0a: Add final receipt completeness check**

```bash
make final-proof-receipt-check
```

- [x] **Step 0b: Require explicit final budget/live-proof status**

```text
Budget status: tightened
Draft receipt: Live proof status: completed | deferred
Final receipt: Live proof status: completed
```

- [x] **Step 0c: Add executable final proof runner**

```bash
LIVE=1 make final-proof-draft
```

- [ ] **Step 1: Run completion evidence**

```bash
make final-proof-preflight
make enterprise-audit
make perfect-fast
make performance-receipt
make perfect-full
make perfect-live
LIVE=1 make final-proof-draft
```

Then fill `docs/final-proof-receipt.md` from exact command output. If
`DEFER_LIVE_REASON="..." make final-proof-draft` is used because sandbox
credentials are unavailable, keep the receipt as a draft blocker; final
acceptance still requires completed sandbox live proof.

- [ ] **Step 2: Remove temporary context file before final acceptance**

```bash
rm docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md
make final-proof-final
```

Before `make final-proof-final`, update the temporary-context cleanup section of `docs/final-proof-receipt.md` with the removed path and the exact final audit command/output.
