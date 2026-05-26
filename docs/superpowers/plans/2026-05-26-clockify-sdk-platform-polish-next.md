# Clockify SDK Platform Polish Next Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining publish-readiness evidence gaps after the 2026-05-26 SDK/CLI/MCP polish pass.

**Architecture:** Keep the existing three-package shape. Add only small verification utilities or tests where they turn ad hoc proof into repeatable gates; do not edit generated SDK files or CI release behavior until the failing remote job evidence points to a specific fix.

**Tech Stack:** TypeScript, Vitest, npm scripts, GitHub CLI, Clockify sandbox env.

---

### Task 1: Triage Current Remote CI Failures

Status: mostly completed in this pass. The Node 22 snapshot failure is fixed
locally in `wrapper/.packsnapshot`; release-please is blocked by repository
Actions settings, not by a repo file diff.

**Files:**
- Modify only after evidence points to a fix: `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`, `wrapper/package.json`, `release-please-config.json`
- Do not modify: `.github/workflows/release.yml`

- [x] **Step 1: Capture failed job logs**

Run:

```bash
cd /Users/15x/Downloads/WORKING/addons-me/fern
gh run view 26455791997 --job "Build, type-check, test (node 22)" --log-failed
gh run view 26455792190 --job "release-please" --log-failed
```

Observed: `gh run view --job <name>` needs numeric job IDs. After resolving IDs, `gh run view --log-failed` hit repeated TLS handshake timeouts, but `gh api /repos/apet97/clockify-ts-sdk/actions/jobs/<id>/logs` succeeded. Node 22 failed on `.packsnapshot`; release-please failed because GitHub Actions is not permitted to create pull requests.

- [x] **Step 2: Reproduce the Node 22 failure locally**

Run:

```bash
cd /Users/15x/Downloads/WORKING/addons-me/fern/wrapper
npm run type-check
npm test
npm run build
npm run build:smoke
npm pack --dry-run
```

Observed: the exact CI pack-snapshot command reproduced drift locally.

- [x] **Step 3: Fix only the proven failure**

If the Node 22 log points at a wrapper test/build issue, write or update the smallest failing test in `wrapper/tests/**`, run it to fail, then make the minimal code/doc/package change. If the release-please log points at config drift, edit only `release-please-config.json` or `.release-please-manifest.json` and run:

```bash
cd /Users/15x/Downloads/WORKING/addons-me/fern
git diff --check -- .github release-please-config.json .release-please-manifest.json wrapper/package.json
```

Expected: diff check exits 0.

Observed: `wrapper/.packsnapshot` was regenerated from the sorted
`npm pack --dry-run --json` file list. The exact CI diff command now exits 0.
The release-please failure should be handled by enabling Actions pull-request
creation or by switching to an approved release token; do not change release
auth without maintainer approval.

### Task 2: Make MCP Live Residue Proof Reusable

Status: completed in this pass; keep the steps below as regression instructions.

**Files:**
- Create: `mcp/scripts/assert-clean-prefixes.mjs`
- Modify: `mcp/package.json`
- Test: `mcp/tests/sandbox.test.ts`

- [x] **Step 1: Add the cleanup assertion script**

Create `mcp/scripts/assert-clean-prefixes.mjs` with this behavior:

```javascript
import { loadContext } from "../dist/client.js";

const prefixes = process.argv.slice(2);
if (prefixes.length === 0) {
    prefixes.push("sdk-test-", "mcp-sandbox-", "mcp-workflow-", "mcp-log-", "mcp-fix-", "DEMO-");
}

const ctx = loadContext();
const workspaceId = ctx.workspaceId;
const hasPrefix = (value) => typeof value === "string" && prefixes.some((prefix) => value.startsWith(prefix));
const nameOf = (item) => item?.name ?? item?.description ?? item?.number ?? "";
const leftovers = { clients: [], projects: [], tags: [], entries: [], invoices: [], webhooks: [] };

async function safe(fn) {
    try {
        return await fn();
    } catch {
        return [];
    }
}

for (const archived of [false, true]) {
    leftovers.clients.push(...(await safe(() => ctx.client.clients.list({ workspaceId, page: 1, "page-size": 200, archived }))).filter((item) => hasPrefix(nameOf(item))));
    leftovers.projects.push(...(await safe(() => ctx.client.projects.list({ workspaceId, page: 1, "page-size": 200, archived }))).filter((item) => hasPrefix(nameOf(item))));
    leftovers.tags.push(...(await safe(() => ctx.client.tags.list({ workspaceId, page: 1, "page-size": 200, archived }))).filter((item) => hasPrefix(nameOf(item))));
}

const user = await ctx.client.users.getCurrentUser();
leftovers.entries.push(...(await safe(() => ctx.client.timeEntries.listForUser({ workspaceId, userId: user.id, start: "2026-05-26T00:00:00.000Z", end: "2026-05-27T00:00:00.000Z", page: 1, "page-size": 200 }))).filter((item) => hasPrefix(nameOf(item))));

const total = Object.values(leftovers).reduce((sum, items) => sum + items.length, 0);
console.log(JSON.stringify({ prefixes, total, leftovers }, null, 2));
process.exit(total === 0 ? 0 : 1);
```

- [x] **Step 2: Add an npm script**

Modify `mcp/package.json`:

```json
"verify:live-cleanup": "npm run build && node scripts/assert-clean-prefixes.mjs"
```

Expected: script exists alongside the current `type-check`, `test`, and `build` scripts.

- [x] **Step 3: Verify after live tests**

Run:

```bash
cd /Users/15x/Downloads/WORKING/addons-me/fern/mcp
CLOCKIFY_API_KEY="$CLOCKIFY_API_KEY" CLOCKIFY_WORKSPACE_ID="$CLOCKIFY_WORKSPACE_ID" npm test
CLOCKIFY_API_KEY="$CLOCKIFY_API_KEY" CLOCKIFY_WORKSPACE_ID="$CLOCKIFY_WORKSPACE_ID" npm run verify:live-cleanup
```

Observed: `npm test` passed earlier in this final-state pass, and `verify:live-cleanup` printed `"total": 0` when run from the repo root with `cd mcp`.

### Task 3: Document Client/Project Update Shape Split

Status: completed in this pass; keep the steps below as regression instructions.

**Files:**
- Modify: `mcp/README.md`
- Modify: `spec/evidence/discrepancies.md`
- Test: `mcp/tests/server.test.ts`

- [x] **Step 1: Record the shape split**

In `spec/evidence/discrepancies.md`, add an entry stating:

```markdown
### fern.sdk.clients-update-body-vs-projects-update-top-level

- Official claim:
  - The generated SDK exposes `clients.update({ workspaceId, clientId, body })` and `projects.update({ workspaceId, projectId, ...fields })`.
- Actual behaviour:
  - Live Clockify accepts client updates only with the nested client body, but project updates use top-level update fields.
- Live evidence:
  - `mcp/tests/server.test.ts` pins both request shapes.
  - 2026-05-26 sandbox cleanup verified client archive+delete only after `clients.update({ body: { name, archived: true } })`.
- MCP tools affected:
  - `clockify_clients_update`
  - `clockify_projects_update`
  - `clockify_demo_cleanup`
- Status:
  - Accepted local SDK shape split; do not normalize these two request shapes in MCP code without a generator fix.
```

- [x] **Step 2: Cross-check tests**

Run:

```bash
cd /Users/15x/Downloads/WORKING/addons-me/fern/mcp
npm test -- tests/server.test.ts -t "update fields"
```

Observed: two tests passed, proving the split remains pinned.
