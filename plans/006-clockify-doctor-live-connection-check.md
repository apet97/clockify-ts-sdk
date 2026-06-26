# Plan 006: Add a live `clockify_doctor` connection-check MCP tool

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 7c3a84c..HEAD -- \
>   mcp/src/tools/status.ts mcp/src/server.ts mcp/src/result.ts \
>   mcp/src/error-codes.ts mcp/src/client.ts mcp/tests/server.test.ts \
>   docs/mcp-tools.json docs/docs-counts-contract.json docs/performance-budgets.json \
>   wrapper/health.ts wrapper/errors.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `7c3a84c`, 2026-06-26

## Why this matters

There is no live "verify it works" check in the MCP surface. The
`clockify://mcp/doctor` resource is explicitly **no-network** and says it
"does not prove credentials by itself" (`mcp/src/resources.ts:111-137`).
`clockify_status` is the de-facto check, but its recovery hint is a single
static string — `"Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set
and valid."` (`mcp/src/tools/status.ts:51`) — that cannot distinguish a 401
(bad key) from a wrong-workspace pin from a network failure. An agent that
hits a misconfiguration gets one undifferentiated string and no remediation.

This plan adds a new read-only tool `clockify_doctor` that performs a real
network preflight and returns a structured pass/fail receipt with
per-failure remediation: validate the API key against `/user`, confirm the
pinned `CLOCKIFY_WORKSPACE_ID` is reachable for that key, report base-URL
posture, and best-effort clock skew. After this lands, the first thing an
operator (or agent) runs when "it doesn't work" tells them exactly which of
the three failure classes they hit and how to fix it.

## Current state

The facts you need, inlined. Read these before editing — do not re-derive.

### How tools are registered and shaped

- `mcp/src/result.ts` — the registration + envelope seam. The function every
  tool uses is:
  ```ts
  defineTool<InputArgs>(server, name, config, handler, recovery?)
  ```
  It wraps the handler in a uniform `try { … } catch (err) { return
  errorResult(name, err, recovery) }` and routes through
  `server.registerTool` so the canonical `outputSchema` monkeypatch fires
  (`mcp/src/result.ts:226-244`). A handler returns a `CallToolResult` built
  by `successResult(action, data, meta?, options?)` (`:111-130`).
- `successResult` options (`SuccessOptions`, `:102-109`) accept
  `entity`, `ids` (undefined values are stripped by `cleanIds`),
  `changed`, `warnings` (`Warning[]` = `{ code?, message }`), `clarification`,
  and `next` (`NextAction[]` = `{ tool, args?, reason? }`).
- `errorResult(action, err, recovery?)` (`:150-176`) classifies via the SDK's
  `classifyClockifyError` first, then status, then message, and sets
  `isError: true`. **The doctor tool deliberately does NOT use `errorResult`
  for failed checks** (see Design decision below) — it returns a `successResult`
  whose `data.ok` is the overall verdict.
- `entityId` is re-exported from `mcp/src/result.ts:246`
  (`entityId(value: unknown): string | undefined`,
  `wrapper/operation-receipt.ts:107`). Use it to pull an id off an SDK object.

### The pattern to mirror — `clockify_status`

`mcp/src/tools/status.ts` (whole file, the structural exemplar):
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Context } from "../client.js";
import { defineTool, entityId, successResult } from "../result.js";

export function registerStatusTool(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_status",
        {
            title: "Clockify status",
            description: "Return the pinned workspace ID, the current user, and any running timer for that user.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const user = await ctx.client.users.getCurrentUser();
            // ...
            return successResult("clockify_status", { /* data */ }, undefined, {
                entity: "workspace",
                ids: { workspaceId: ctx.workspaceId, userId },
                next: [ /* ... */ ],
            });
        },
        "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid.",
    );
}
```
`registerStatusTool` is wired in `mcp/src/server.ts:63` (right after
`registerAgentDocsTools`). `clockify_status` is a zero-argument tool: no
`inputSchema` in its config. The doctor tool is also zero-argument.

### SDK primitives the doctor will call (both already exist)

- `ctx.client.health()` — attached to every constructed client by
  `createClockifyClient` (`wrapper/create-client.ts:349,364-372`). It calls
  `clockifyHealth` (`wrapper/health.ts:61-86`) and **never throws** — it
  returns `HealthCheckResult`:
  ```ts
  interface HealthCheckResult {
      ok: boolean;          // true iff GET /user returned 2xx
      user?: UserDtoV1;     // present iff ok
      latencyMs: number;    // single-request wall-clock latency
      serverTime?: Date;    // parsed from response `Date` header; absent if missing/unparseable
      error?: unknown;      // present iff !ok; a ClockifyApiError subclass, inspect via classifyClockifyError
  }
  ```
- `ctx.client.workspaces.list()` — returns `Workspace[]`
  (`wrapper/src/api/resources/workspaces/client/Client.ts:20-23`). For the
  API-key auth this MCP uses, it returns every workspace the key can reach.
  **This CAN throw** — wrap it.

### Error classification — reuse, don't reinvent

`classifyClockifyError(err)` is imported from `clockify-sdk-ts-115/errors`
(it is `wrapper/errors.ts:347`, re-exported as the `errors` subpath). For a
`ClockifyApiError` it returns `{ code, recovery, retryable, statusCode?,
serverCode?, message }`; for a non-SDK error it returns `undefined`. The
stable codes you will branch on (from `mcp/src/error-codes.ts`):
- `auth_or_permission` (HTTP 401/403) — bad/missing/expired key or wrong
  workspace permission.
- `connection_error` (no HTTP response) — network/DNS/TLS/proxy.
- `not_found` (404, or a 400 "doesn't belong to / doesn't exist" body).

### The Context

`mcp/src/client.ts:14-26` — `Context` carries `client`, `workspaceId`,
optional `confirmationTokens`, optional `currentUserId`. It does **not**
carry the base URL, so the doctor reads `process.env.CLOCKIFY_BASE_URL`
directly for base-URL posture (the same env var `loadContext` reads at
`mcp/src/client.ts:72`). `CLOCKIFY_BASE_URL` is not a secret, but the tool
reports only the URL **host** (never the full value/path) to be conservative.

### Design decision (load-bearing — honor it)

`clockify_doctor` is a diagnostic. The tool **call itself succeeds** even when
a check fails — it returns a `successResult` (protocol `isError` stays falsy)
whose `data.ok` is the overall verdict and whose `data.checks[]` carries
per-check `ok` + `remediation`. This is intentional: an agent gets the full
diagnostic (all four checks) instead of one short-circuited error. Each
network call is wrapped so the handler never throws into `defineTool`'s catch.

### The tool/prompt count cascade (this plan changes 134 → 135)

The advertised MCP tool count is **134** (21 workflow + 113 domain). Adding
one tool makes it **135** (22 workflow + 113 domain). `clockify_doctor` is
registered top-level like `clockify_status`, and `clockify_status` is listed
under `workflowTools` in `docs/mcp-tools.json`, so the doctor goes there too:
`workflowTools` 21 → 22, `domainTools` stays 113.

The count appears in these places (verified at `7c3a84c`):
- `docs/mcp-tools.json` — `summary.totalTools` 134, `summary.workflowTools` 21,
  and the `workflowTools[]` array (must gain an entry; a consistency check
  asserts `summary.workflowTools == workflowTools.length`, see
  `docs/docs-counts-contract.json:44`).
- `docs/mcp-tool-manifest.json` — **generated** from the live server by
  `make mcp-tool-manifest`; do not hand-edit.
- `mcp/tests/server.test.ts:84-243` — a hardcoded sorted list of all 134 tool
  names plus `expect(names).toHaveLength(134)` at `:243`.
- `mcp/tests/tool-manifest.test.ts:37-46` — `>= 134` / `>= 21` / `>= 113`
  floor assertions (these pass at 135/22/113 without edits, but the manifest
  must be regenerated first).
- `scripts/check-performance-budgets.mjs:14` derives `EXPECTED_TOOLS` from
  `docs/mcp-tools.json` `summary.totalTools` and asserts the live smoke lists
  exactly that many (`:401`). **No code edit needed** — it auto-tracks the
  bumped JSON. Only the prose rationale in `docs/performance-budgets.json:95`
  says "134-tool surface" — update that string for accuracy.
- `docs/docs-counts-contract.json:67-86` `forbiddenStrings` — the denylist of
  stale counts; `make docs-counts` fails if any prose doc still contains a
  listed string. Add `"134 tools"` and ensure no prose doc still contains it.
- Prose mentions of the count:
  - `AGENTS.md:41` — `**134 tools**: 21` (contains "134 tools")
  - `AGENTS.md:354` — `(the surface is 134)`
  - `CLAUDE.md:18` — `134 tools (21 workflow + 113 domain)` (contains "134 tools")
  - `CLAUDE.md:257` — `(the surface is 134)`
  - `mcp/README.md:9` — `advertises 134 tools: 21 workflow plus 113` (contains "134 tools")
  - `mcp/README.md:370` — `| Tools | 134 | 156 |`
  - `README.md:11` — `134 stdio tools`
  - `README.md:135` — `134 stdio tools (21 workflow + 113 domain)`
- `docs/product-surface.{json,md}` — **generated** by `make product-surface`
  (reads `docs/mcp-tools.json`); do not hand-edit. A consistency check asserts
  `product-surface.…declaredToolCount == mcp-tools.summary.totalTools`
  (`docs/docs-counts-contract.json:46-48`).
- `docs/operation-parity.{json,md}` — **generated** by `make operation-parity`
  (the new tool is MCP-only with no OpenAPI operation); do not hand-edit.
- `mcp/CHANGELOG.md` — `make changelog-drift` requires a changelog entry for
  any touched package. Add an `[Unreleased]` → `Added` entry.

## Commands you will need

Run from the repo root unless noted. The repo is npm workspaces (`wrapper`,
`cli`, `mcp`) with a single root `package-lock.json`.

| Purpose | Command | Expected on success |
|---|---|---|
| Install (once) | `npm ci` | exit 0 |
| Generate SDK (fresh tree only) | `make sdk-codegen` | populates `output/ts-sdk/` + `wrapper/src/` |
| Build SDK wrapper | `npm run build -w clockify-sdk-ts-115` | exit 0, `wrapper/dist/**` current |
| Type-check MCP | `npm run type-check -w @clockify115/mcp-server` | exit 0, no errors |
| Build MCP | `npm run build -w @clockify115/mcp-server` | exit 0 |
| Test MCP (filter) | `npm test -w @clockify115/mcp-server -- doctor` | new doctor tests pass |
| Test MCP (full) | `npm test -w @clockify115/mcp-server` | all pass |
| Lint MCP | `npm run lint -w @clockify115/mcp-server` | exit 0 |
| Regenerate tool manifest | `make mcp-tool-manifest` | rewrites `docs/mcp-tool-manifest.json` |
| Regenerate README tables | `make readme-tables` | rewrites CLI/MCP README tables |
| Regenerate product surface | `make product-surface` | rewrites `docs/product-surface.{json,md}` |
| Regenerate operation parity | `make operation-parity` | rewrites `docs/operation-parity.{json,md}` |
| Count consistency gate | `make docs-counts` | exit 0 |
| Handoff/stale-count gate | `make agent-handoff` | exit 0 |
| Final full proof (SOLO) | `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full` | exit 0 |

**Important env note**: always run gates with `CLOCKIFY_API_KEY=''
CLOCKIFY_WORKSPACE_ID=''` so the live `sandbox.test.ts` suites self-skip and
the run is deterministic. With creds set they fail 401 on the dead sandbox key.

**Fresh-clone note**: `output/ts-sdk/**` and `wrapper/src/**` are gitignored.
If `wrapper/src/` is empty, run `make sdk-codegen` once before building.

## Suggested executor toolkit

- Use the `tdd` skill if available: write the failing `mcp/tests/doctor.test.ts`
  cases first (Step 3), then implement the tool (Step 1) until green.
- The drift check command at the top must pass clean before you start.

## Scope

**In scope** (the only files you should modify or create):
- `mcp/src/tools/doctor.ts` (create) — the new tool.
- `mcp/src/server.ts` (edit) — import + register the tool.
- `mcp/tests/doctor.test.ts` (create) — the new test.
- `mcp/tests/server.test.ts` (edit) — add the name, bump 134 → 135.
- `docs/mcp-tools.json` (edit) — bump counts, add workflow entry.
- `docs/docs-counts-contract.json` (edit) — add `"134 tools"` to denylist.
- `docs/performance-budgets.json` (edit) — prose "134-tool" → "135-tool".
- `mcp/CHANGELOG.md` (edit) — `[Unreleased]` → `Added` entry.
- Prose count updates: `AGENTS.md`, `CLAUDE.md`, `README.md`, `mcp/README.md`.
- **Generated, via make targets only (do not hand-edit)**:
  `docs/mcp-tool-manifest.json`, CLI/MCP README tables,
  `docs/product-surface.{json,md}`, `docs/operation-parity.{json,md}`.

**Out of scope** (do NOT touch, even though they look related):
- `mcp/src/tools/status.ts` — leave `clockify_status` and its static recovery
  string unchanged; the doctor is additive, not a replacement.
- `mcp/src/resources.ts` — the no-network `clockify://mcp/doctor` resource
  stays no-network; do not make it call the network.
- `wrapper/**` and `output/ts-sdk/**` — generated/SDK code; `client.health()`
  and `workspaces.list()` already exist. Do not edit. (`wrapper/src/**`,
  `output/ts-sdk/**`, `spec/corrected/**` are hard-stop no-edit per CLAUDE.md.)
- The MCP server `version` literal in `mcp/src/server.ts:51` — release-please
  owns version bumps; do not change it.
- `scripts/check-performance-budgets.mjs` — it auto-derives the count; no edit.

## Git workflow

- Branch: `advisor/006-clockify-doctor` (the repo's default branch is `main`;
  branch before committing).
- Commit style is Conventional Commits (see `git log`, e.g.
  `fix(spec,cli,mcp): …`). Suggested message:
  `feat(mcp): add clockify_doctor live connection-check tool (134->135)`.
- End the commit message body with the required trailer:
  `Claude-Session: https://claude.ai/code/session_01RQMMk1X6R6tDugs3onjFBP`
- Do NOT push or open a PR unless the operator instructed it. No
  `git push --force`. No `npm publish`.

## Steps

### Step 1: Create the tool `mcp/src/tools/doctor.ts`

Create the file with this exact shape. It is zero-argument (no `inputSchema`),
read-only, never throws into the catch, and returns a `successResult` whose
`data.ok` is the overall verdict. The description is well over 40 characters
(a gate + `server.test.ts` flags descriptions `< 40` chars).

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { classifyClockifyError } from "clockify-sdk-ts-115/errors";

import type { Context } from "../client.js";
import { defineTool, entityId, successResult } from "../result.js";

/** Local clock more than this far from Clockify server time is a warning. */
const CLOCK_SKEW_WARN_MS = 5 * 60 * 1000;

interface DoctorCheck {
    name: string;
    ok: boolean;
    detail: string;
    /** Critical checks decide the overall verdict; informational ones do not. */
    critical?: boolean;
    code?: string;
    remediation?: string;
}

export function registerDoctorTool(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_doctor",
        {
            title: "Clockify doctor (live preflight)",
            description:
                "Run a live connection preflight: validate CLOCKIFY_API_KEY against /user, confirm the pinned CLOCKIFY_WORKSPACE_ID is reachable for that key, report base-URL posture, and estimate clock skew. Returns a pass/fail receipt with per-failure remediation.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const checks: DoctorCheck[] = [];
            const warnings: { code?: string; message: string }[] = [];
            let userId = "";
            let userEmail = "";
            let userName = "";

            // 1) Auth + connectivity. client.health() never throws.
            const health = await ctx.client.health();
            if (health.ok) {
                userId = entityId(health.user) ?? "";
                userEmail = (health.user as { email?: string } | undefined)?.email ?? "";
                userName = (health.user as { name?: string } | undefined)?.name ?? "";
                checks.push({
                    name: "auth",
                    ok: true,
                    critical: true,
                    detail: `API key valid; authenticated as ${userEmail || userId || "unknown user"} (${health.latencyMs}ms).`,
                });
            } else {
                const c = classifyClockifyError(health.error);
                const code = c?.code ?? "error";
                checks.push({
                    name: "auth",
                    ok: false,
                    critical: true,
                    code,
                    detail: c?.message ?? "Could not authenticate against Clockify /user.",
                    remediation:
                        code === "auth_or_permission"
                            ? "CLOCKIFY_API_KEY is missing, invalid, or expired. Regenerate it at Clockify > Profile settings > API, then update the MCP client's env block."
                            : code === "connection_error"
                              ? "Could not reach Clockify. Check network, DNS, TLS, proxy, and CLOCKIFY_BASE_URL, then retry."
                              : (c?.recovery ?? "Verify CLOCKIFY_API_KEY and network connectivity, then retry."),
                });
            }

            // 2) Workspace pin — only meaningful if auth succeeded.
            if (health.ok) {
                try {
                    const workspaces = (await ctx.client.workspaces.list()) as unknown[];
                    const present = workspaces.some((w) => entityId(w) === ctx.workspaceId);
                    checks.push({
                        name: "workspace_pin",
                        ok: present,
                        critical: true,
                        detail: present
                            ? `CLOCKIFY_WORKSPACE_ID is one of this key's ${workspaces.length} workspace(s).`
                            : `CLOCKIFY_WORKSPACE_ID is not among this key's ${workspaces.length} workspace(s).`,
                        ...(present
                            ? {}
                            : {
                                  code: "not_found",
                                  remediation:
                                      "Confirm CLOCKIFY_WORKSPACE_ID is the 24-character id of a workspace this API key can access (Clockify > workspace settings).",
                              }),
                    });
                } catch (err) {
                    const c = classifyClockifyError(err);
                    checks.push({
                        name: "workspace_pin",
                        ok: false,
                        critical: true,
                        code: c?.code ?? "error",
                        detail: c?.message ?? "Could not list workspaces to confirm the pin.",
                        remediation: c?.recovery ?? "Retry; if it persists, verify the API key's permissions.",
                    });
                }
            }

            // 3) Base-URL posture (informational; never echoes the full value).
            const rawBaseUrl = process.env.CLOCKIFY_BASE_URL;
            let baseUrlDetail: string;
            if (!rawBaseUrl) {
                baseUrlDetail = "CLOCKIFY_BASE_URL unset; using the default Clockify host.";
            } else {
                let host = "custom (set)";
                try {
                    host = new URL(rawBaseUrl).host;
                } catch {
                    /* keep the generic label; never echo a malformed value */
                }
                baseUrlDetail = `CLOCKIFY_BASE_URL points at ${host} (mock/replay or trusted proxy).`;
                warnings.push({ message: `Live requests route via custom base URL host ${host}.` });
            }
            checks.push({ name: "base_url", ok: true, detail: baseUrlDetail });

            // 4) Clock skew (best-effort; informational unless large).
            if (health.ok && health.serverTime instanceof Date) {
                const skewMs = health.serverTime.getTime() - Date.now();
                const within = Math.abs(skewMs) <= CLOCK_SKEW_WARN_MS;
                checks.push({
                    name: "clock_skew",
                    ok: within,
                    detail: within
                        ? `Local clock within ${Math.round(Math.abs(skewMs) / 1000)}s of Clockify server time.`
                        : `Local clock is off by ~${Math.round(skewMs / 1000)}s vs Clockify server time.`,
                    ...(within
                        ? {}
                        : {
                              remediation:
                                  "Sync the host clock (NTP). Large skew can break time-entry start/stop and signed requests.",
                          }),
                });
                if (!within) {
                    warnings.push({
                        message: `Clock skew ~${Math.round(skewMs / 1000)}s exceeds ${CLOCK_SKEW_WARN_MS / 1000}s.`,
                    });
                }
            } else {
                checks.push({
                    name: "clock_skew",
                    ok: true,
                    detail: "Server time unavailable; clock skew not measured.",
                });
            }

            const overall = checks.filter((c) => c.critical).every((c) => c.ok);

            return successResult(
                "clockify_doctor",
                {
                    ok: overall,
                    workspaceId: ctx.workspaceId,
                    user: health.ok ? { id: userId, email: userEmail, name: userName } : null,
                    latencyMs: health.latencyMs,
                    checks,
                },
                undefined,
                {
                    entity: "workspace",
                    ids: { workspaceId: ctx.workspaceId, userId },
                    ...(warnings.length > 0 ? { warnings } : {}),
                    next: overall
                        ? [
                              {
                                  tool: "clockify_status",
                                  reason: "Credentials verified; check running timer and user state.",
                              },
                          ]
                        : [
                              {
                                  tool: "clockify_status",
                                  reason: "Re-run after applying the remediation above.",
                              },
                          ],
                },
            );
        },
    );
}
```

Notes:
- Do NOT pass a `recovery` argument to `defineTool` — the doctor owns its own
  per-check remediation; the catch-site recovery is only for unexpected throws.
- `ids.userId` may be `""` on auth failure; `cleanIds` in `result.ts` strips
  empty values, so the receipt's `ids` will just omit `userId` then.

**Verify**: `npm run type-check -w @clockify115/mcp-server` → exit 0, no errors.

### Step 2: Register the tool in `mcp/src/server.ts`

Add the import next to the other tool imports (keep alphabetical-ish grouping;
place it adjacent to the status import):
```ts
import { registerDoctorTool } from "./tools/doctor.js";
```
And register it immediately after `registerStatusTool(server, ctx);`
(currently `mcp/src/server.ts:63`):
```ts
    registerStatusTool(server, ctx);
    registerDoctorTool(server, ctx);
```

**Verify**:
```bash
npm run build -w clockify-sdk-ts-115 && npm run build -w @clockify115/mcp-server
```
→ both exit 0. (Build the wrapper first so its `dist/**` types are current.)

### Step 3: Create the test `mcp/tests/doctor.test.ts`

Model the harness after `mcp/tests/server.test.ts` (the `connect()` +
`InMemoryTransport` pattern), but build a doctor-capable fake `Context` that
provides `client.health()` and `client.workspaces.list()` (the
`server.test.ts` `fakeContext` does NOT have these). Construct real SDK error
subclasses so `classifyClockifyError` produces stable codes.

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClockifyConnectionError, UnauthorizedError } from "clockify-sdk-ts-115/errors";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

interface HealthOverride {
    ok: boolean;
    user?: { id: string; email: string; name: string };
    latencyMs?: number;
    serverTime?: Date;
    error?: unknown;
}

function fakeContext(overrides?: {
    health?: HealthOverride;
    workspaces?: () => Promise<unknown[]>;
    workspaceId?: string;
}): Context {
    const health: HealthOverride = overrides?.health ?? {
        ok: true,
        user: { id: "user-1", email: "alice@example.com", name: "Alice" },
        latencyMs: 12,
        serverTime: new Date(),
    };
    return {
        workspaceId: overrides?.workspaceId ?? "ws-1",
        client: {
            health: async () => ({
                ok: health.ok,
                user: health.user,
                latencyMs: health.latencyMs ?? 0,
                serverTime: health.serverTime,
                error: health.error,
            }),
            workspaces: {
                list: overrides?.workspaces ?? (async () => [{ id: "ws-1", name: "WS" }]),
            },
            // status.ts and other tools registered by buildServer need these to exist
            // for listTools()/initialize, but the doctor test only calls clockify_doctor.
            users: { getCurrentUser: async () => health.user ?? {} },
            timeEntries: { listInProgress: async () => [] },
        } as never,
    };
}

let teardown: () => Promise<void> = async () => {};
afterEach(async () => {
    await teardown();
    delete process.env.CLOCKIFY_BASE_URL;
});

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "doctor-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function parse(res: { content: { text: string }[] }) {
    return JSON.parse(res.content[0].text);
}

describe("clockify_doctor", () => {
    it("passes when key, workspace pin, base url, and clock are all healthy", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        expect(res.isError).toBeFalsy();
        const env = parse(res as never);
        expect(env.ok).toBe(true);
        expect(env.data.ok).toBe(true);
        expect(env.data.workspaceId).toBe("ws-1");
        expect(env.data.user.email).toBe("alice@example.com");
        const byName = Object.fromEntries(env.data.checks.map((c: { name: string }) => [c.name, c]));
        expect(byName.auth.ok).toBe(true);
        expect(byName.workspace_pin.ok).toBe(true);
        expect(byName.base_url.ok).toBe(true);
        expect(byName.clock_skew.ok).toBe(true);
        expect(env.next[0].tool).toBe("clockify_status");
    });

    it("fails the auth check with a regenerate-key remediation on 401", async () => {
        const client = await connect(
            fakeContext({ health: { ok: false, latencyMs: 5, error: new UnauthorizedError() } }),
        );
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        expect(res.isError).toBeFalsy(); // diagnostic call itself succeeds
        const env = parse(res as never);
        expect(env.data.ok).toBe(false);
        const auth = env.data.checks.find((c: { name: string }) => c.name === "auth");
        expect(auth.ok).toBe(false);
        expect(auth.code).toBe("auth_or_permission");
        expect(auth.remediation).toMatch(/Profile settings > API/);
        expect(env.data.user).toBeNull();
    });

    it("flags a wrong workspace pin not in the key's workspaces", async () => {
        const client = await connect(
            fakeContext({ workspaces: async () => [{ id: "other-ws", name: "Other" }] }),
        );
        const res = await client.callTool({ name: "clockify_doctor", arguments: {} });
        const env = parse(res as never);
        expect(env.data.ok).toBe(false);
        const pin = env.data.checks.find((c: { name: string }) => c.name === "workspace_pin");
        expect(pin.ok).toBe(false);
        expect(pin.code).toBe("not_found");
        expect(pin.remediation).toMatch(/24-character id/);
    });

    it("reports a connection_error remediation when health cannot reach Clockify", async () => {
        const client = await connect(
            fakeContext({
                health: {
                    ok: false,
                    latencyMs: 3,
                    error: new ClockifyConnectionError({ cause: new TypeError("fetch failed") }),
                },
            }),
        );
        const env = parse((await client.callTool({ name: "clockify_doctor", arguments: {} })) as never);
        const auth = env.data.checks.find((c: { name: string }) => c.name === "auth");
        expect(auth.code).toBe("connection_error");
        expect(auth.remediation).toMatch(/network/i);
    });

    it("warns on large clock skew but keeps the overall verdict on critical checks", async () => {
        const client = await connect(
            fakeContext({
                health: {
                    ok: true,
                    user: { id: "user-1", email: "alice@example.com", name: "Alice" },
                    latencyMs: 10,
                    serverTime: new Date(Date.now() + 30 * 60 * 1000), // +30 min
                },
            }),
        );
        const env = parse((await client.callTool({ name: "clockify_doctor", arguments: {} })) as never);
        const skew = env.data.checks.find((c: { name: string }) => c.name === "clock_skew");
        expect(skew.ok).toBe(false);
        expect(env.data.ok).toBe(true); // skew is non-critical; auth + pin still pass
        expect(env.warnings.some((w: { message: string }) => /skew/i.test(w.message))).toBe(true);
    });

    it("reports custom base-URL posture as host-only, never the full value", async () => {
        process.env.CLOCKIFY_BASE_URL = "https://mock.internal.example/api/v1?secret=x";
        const client = await connect(fakeContext());
        const env = parse((await client.callTool({ name: "clockify_doctor", arguments: {} })) as never);
        const baseUrl = env.data.checks.find((c: { name: string }) => c.name === "base_url");
        expect(baseUrl.detail).toContain("mock.internal.example");
        expect(baseUrl.detail).not.toContain("secret=x");
    });
});
```

If `ClockifyConnectionError` / `UnauthorizedError` are not exported from the
`clockify-sdk-ts-115/errors` subpath when you import them, confirm against
`wrapper/errors.ts` (they are exported there: `UnauthorizedError` at
`wrapper/errors.ts:38-44`, `ClockifyConnectionError` is a class declared and
exported in the same module). If an import fails, that is a STOP condition.

**Verify**: `npm test -w @clockify115/mcp-server -- doctor` → all doctor tests
pass (6 new tests).

### Step 4: Update `mcp/tests/server.test.ts` (add name, bump count)

In the sorted-name array (`:84-241`), add `"clockify_doctor"` near the status
group (the array is `.sort()`ed before comparison, so position is cosmetic —
put it under the `// Status` comment after `"clockify_status"`):
```ts
                // Status
                "clockify_status",
                "clockify_doctor",
                "clockify_tools_guide",
```
Then change the length assertion at `:243`:
```ts
        expect(names).toHaveLength(135);
```

**Verify**: `npm test -w @clockify115/mcp-server -- server` → passes,
including the "advertises every tool we registered" test.

### Step 5: Update `docs/mcp-tools.json` counts + workflow list

- `summary.totalTools`: `134` → `135`
- `summary.workflowTools`: `21` → `22`
- Add an entry to the `workflowTools` array (after the `clockify_status`
  entry, so the array length becomes 22):
  ```json
  { "tool": "clockify_doctor", "purpose": "Live preflight: validate the API key, workspace pin, base-URL posture, and clock skew (read-only)." },
  ```
- Leave `summary.domainTools` at `113` and `domainGroups` unchanged.

**Verify**: `node -e "const j=require('./docs/mcp-tools.json'); if(j.summary.totalTools!==135||j.summary.workflowTools!==22||j.workflowTools.length!==22) throw new Error('count mismatch'); console.log('ok')"` → prints `ok`.

### Step 6: Update the denylist + budget prose

- `docs/docs-counts-contract.json`: add `"134 tools"` to the
  `forbiddenStrings` array (alongside the existing `"127 tools"` etc.).
- `docs/performance-budgets.json:95`: change `"...the 134-tool surface..."`
  to `"...the 135-tool surface..."` (prose only; the script auto-derives the
  numeric assertion from `docs/mcp-tools.json`).

**Verify**: `grep -n '"134 tools"' docs/docs-counts-contract.json` → matches;
`grep -c "134-tool" docs/performance-budgets.json` → `0`.

### Step 7: Update prose count mentions

Update each to reflect 135 tools (22 workflow + 113 domain). After editing,
**no proseDoc may still contain the literal `134 tools`**.

- `AGENTS.md:41` — `**134 tools**: 21` → `**135 tools**: 22` (and adjust the
  surrounding "21 workflow" wording to "22 workflow" if present on that line).
- `AGENTS.md:354` — `(the surface is 134)` → `(the surface is 135)`.
- `CLAUDE.md:18` — `134 tools (21 workflow + 113 domain)` →
  `135 tools (22 workflow + 113 domain)`.
- `CLAUDE.md:257` — `(the surface is 134)` → `(the surface is 135)`.
- `mcp/README.md:9` — `advertises 134 tools: 21 workflow plus 113` →
  `advertises 135 tools: 22 workflow plus 113`.
- `mcp/README.md:370` — `| Tools | 134 | 156 |` → `| Tools | 135 | 156 |`.
- `README.md:11` — `134 stdio tools` → `135 stdio tools`.
- `README.md:135` — `134 stdio tools (21 workflow + 113 domain)` →
  `135 stdio tools (22 workflow + 113 domain)`.

**Verify**: `grep -rn "134 tools" AGENTS.md CLAUDE.md README.md mcp/README.md`
→ no matches. `grep -rn "134" AGENTS.md CLAUDE.md README.md mcp/README.md`
→ only acceptable residue (none referencing the tool count).

### Step 8: Add the changelog entry

In `mcp/CHANGELOG.md`, under `## [Unreleased]`, add an `### Added` section
(above the existing `### Fixed`):
```markdown
### Added

- `clockify_doctor`: a read-only live connection-check tool. It validates
  CLOCKIFY_API_KEY against `/user`, confirms the pinned CLOCKIFY_WORKSPACE_ID
  is reachable for that key, reports base-URL posture (host only), and
  estimates clock skew, returning a pass/fail receipt with per-failure
  remediation. Tool surface 134 -> 135 (22 workflow + 113 domain).
```

**Verify**: `make changelog-drift` →
`CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make changelog-drift` exits 0.

### Step 9: Regenerate every generated count surface (do NOT hand-edit these)

Run, in this order (build the wrapper + mcp first if not already current):
```bash
npm run build -w clockify-sdk-ts-115
npm run build -w @clockify115/mcp-server
make mcp-tool-manifest      # rewrites docs/mcp-tool-manifest.json from the live server
make readme-tables          # rewrites CLI/MCP README command/tool tables
make product-surface        # rewrites docs/product-surface.{json,md}
make operation-parity       # rewrites docs/operation-parity.{json,md}
```

**Verify each**:
- `node -e "const m=require('./docs/mcp-tool-manifest.json'); if(m.summary.totalTools!==135) throw new Error('manifest total '+m.summary.totalTools); if(!m.tools.find(t=>t.name==='clockify_doctor')) throw new Error('doctor missing from manifest'); console.log('manifest ok')"` → `manifest ok`.
- `grep -rn "clockify_doctor" docs/product-surface.json docs/operation-parity.json` → at least one match in each (operation-parity lists it as MCP-only).
- `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make docs-counts` → exit 0
  (this proves the JSON counts, product-surface counts, and prose are all
  consistent and no stale string remains).
- `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make agent-handoff` → exit 0.

### Step 10: Lint, then the full solo proof

```bash
npm run lint -w @clockify115/mcp-server
npm test -w @clockify115/mcp-server          # full MCP suite, all pass
```
Then, **run solo (no other heavy commands / agents concurrently)** — the
`performance-budgets` sub-gate measures startup time and flakes under CPU
contention:
```bash
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full
echo "perfect-full exit: $?"
```
The count surfaces (`docs-counts`, `mcp-tool-manifest-drift`,
`product-surface-drift`, `operation-parity-drift`, `readme-tables-drift`,
`performance-budgets`) live in `perfect-full` — `perfect-fast` does not run
all of them, so you must use `perfect-full` for the final proof.

**Verify**: `perfect-full exit: 0`. If `performance-budgets` is the only red
and it is a startup-time flake (not a file-size or count failure), re-run it
solo: `make performance-budgets` — the heavy proofs already ran since it is
the last prerequisite.

## Test plan

New tests in `mcp/tests/doctor.test.ts` (Step 3), six cases:
1. **Happy path** — key valid, pin present, base URL unset, clock fresh →
   `data.ok: true`, all four checks `ok`, user populated, `next` → status.
2. **401 auth fail** — `health.ok: false` with `UnauthorizedError` →
   `data.ok: false`, `auth.code: "auth_or_permission"`, remediation names
   "Profile settings > API", `data.user: null`. (The regression this plan
   fixes: a 401 now yields a *specific* remediation, not a static string.)
3. **Wrong workspace pin** — pin not in `workspaces.list()` →
   `workspace_pin.ok: false`, `code: "not_found"`, remediation names the
   24-character id.
4. **Connection error** — `ClockifyConnectionError` → `auth.code:
   "connection_error"`, remediation mentions network.
5. **Clock skew warning** — `serverTime` +30 min → `clock_skew.ok: false`
   but `data.ok: true` (skew is non-critical) and a `warnings[]` entry.
6. **Base-URL posture** — `CLOCKIFY_BASE_URL` set with a query string →
   detail contains the host, never the full value/secret.

Structural pattern: model after `mcp/tests/server.test.ts` (`connect()` +
`InMemoryTransport` + `buildServer`), but with a doctor-capable fake context.

Existing-test update: `mcp/tests/server.test.ts` gains `"clockify_doctor"` and
`toHaveLength(135)`. `mcp/tests/tool-manifest.test.ts` floors (`>= 134/21/113`)
keep passing at 135/22/113 once the manifest is regenerated (Step 9).

Verification: `npm test -w @clockify115/mcp-server` → all pass, including the
6 new doctor tests and the updated server.test count.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run type-check -w @clockify115/mcp-server` exits 0.
- [ ] `npm run build -w clockify-sdk-ts-115 && npm run build -w @clockify115/mcp-server` exit 0.
- [ ] `npm test -w @clockify115/mcp-server` exits 0; `mcp/tests/doctor.test.ts`
      exists with the 6 cases and passes; `server.test.ts` asserts length 135.
- [ ] `npm run lint -w @clockify115/mcp-server` exits 0.
- [ ] `docs/mcp-tools.json`: `summary.totalTools == 135`,
      `summary.workflowTools == 22`, `workflowTools.length == 22`,
      `summary.domainTools == 113`.
- [ ] `docs/mcp-tool-manifest.json` (regenerated) contains a `clockify_doctor`
      tool and `summary.totalTools == 135`.
- [ ] `grep -rn "134 tools" AGENTS.md CLAUDE.md README.md mcp/README.md`
      returns no matches; `"134 tools"` is in
      `docs/docs-counts-contract.json` `forbiddenStrings`.
- [ ] `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make docs-counts` exits 0.
- [ ] `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make agent-handoff` exits 0.
- [ ] `mcp/CHANGELOG.md` has the `[Unreleased] > Added` entry;
      `make changelog-drift` exits 0.
- [ ] `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full` exits 0
      (run solo; see the performance-budgets flake caveat).
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row for plan 006 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `7c3a84c` and the
  "Current state" excerpts no longer match the live code (e.g. `defineTool`
  signature, `successResult` options, `client.health()` shape, or the
  `server.test.ts` tool list / length assertion moved).
- `ctx.client.health` or `ctx.client.workspaces.list` does not exist on the
  built client type (type-check error) — the SDK surface drifted; do not
  reach into generated `wrapper/src/**` to add it.
- Importing `UnauthorizedError` or `ClockifyConnectionError` from
  `clockify-sdk-ts-115/errors` fails — the errors subpath export drifted.
- A count gate (`docs-counts`, `mcp-tool-manifest-drift`,
  `product-surface-drift`, `operation-parity-drift`) is red after Step 9 with
  a *count mismatch* (not a startup-time flake) — you missed a surface; report
  which gate and its message rather than editing a generated file by hand.
- `make perfect-full` is red on something other than a `performance-budgets`
  startup-time flake, and a reasonable second attempt does not clear it.
- The work appears to require editing an out-of-scope file (especially
  `mcp/src/tools/status.ts`, `mcp/src/resources.ts`, or anything under
  `wrapper/src/**` / `output/ts-sdk/**` / `spec/corrected/**`).

## Maintenance notes

For the human/agent who owns this after it lands:

- **What a reviewer should scrutinize**: that `clockify_doctor` is genuinely
  read-only (no writes, no `confirm_token`), that it never echoes the API key
  or full base URL (only the host), and that the per-check remediation strings
  stay actionable. Confirm the design decision — diagnostic call returns
  `successResult` with `data.ok` rather than `errorResult` — is preserved; an
  agent relies on getting all four checks back even on failure.
- **What interacts with this**: any future change to the error taxonomy in
  `docs/error-codes.json` / `mcp/src/error-codes.ts` flows through
  `classifyClockifyError`, so the doctor's `code`-keyed remediation branches
  (`auth_or_permission`, `connection_error`, `not_found`) should be re-checked
  if those codes are renamed.
- **Count cascade**: this is the canonical example of a tool-count change. Any
  later tool add/remove must repeat Steps 5-9 (JSON counts, denylist, prose,
  and the four generated surfaces) or the `perfect-full` count gates go red.
- **Deferred out of scope (intentionally)**: (a) adding `clockify_doctor` to
  the agent-docs catalog (`mcp/src/agent-docs/catalog.ts`) so
  `clockify_docs_search` surfaces it — nice-to-have, not required; (b) a CLI
  `clk115 doctor` parity command — the CLI already has a `doctor` command per
  `CLAUDE.md`, so confirm before duplicating; (c) replacing
  `clockify_status`'s static recovery string with a pointer to
  `clockify_doctor` — left out to keep this plan additive.
```
