# Plan 007: Start the MCP server even with no credentials, returning a `setup_required` receipt per tool instead of crashing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 7c3a84c..HEAD -- mcp/src/index.ts mcp/src/client.ts mcp/src/result.ts mcp/src/error-codes.ts docs/error-codes.json docs/error-registry-contract.json mcp/tests/client.test.ts mcp/tests/result.test.ts mcp/tests/server.test.ts`
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

Today, when `CLOCKIFY_API_KEY` or `CLOCKIFY_WORKSPACE_ID` is absent, `loadContext()`
throws (`mcp/src/client.ts:73-83`) and the stdio entrypoint writes `fatal: …` to
stderr and calls `process.exit(1)` (`mcp/src/index.ts:26-32`). In Claude Desktop
this surfaces only as "server disconnected / failed to start"; the actionable
remediation is buried in a log file a non-developer never opens. The fix: let the
server **start** even with absent creds, and have every tool return a friendly,
structured `setup_required` receipt (stable error code + exact remediation:
which env vars to set, where, and where to get them) through the existing
`errorResult`/recovery path. The happy path (creds present) is unchanged, and a
present-but-wrong key keeps surfacing as `auth_or_permission` at call time (that
case already does not crash — `loadContext` only checks *presence*). After this,
a first-run user sees a tool call that says exactly what to fix, instead of a
dead server.

## Current state

Files and their roles:

- `mcp/src/client.ts` — `loadContext()` reads env, **throws** on missing
  `CLOCKIFY_API_KEY`/`CLOCKIFY_WORKSPACE_ID`, else builds the SDK client and the
  `Context`. Also defines the `Context` type and `createCurrentUserIdMemo`.
- `mcp/src/index.ts` — `main()` = `loadContext()` → `buildServer()` →
  `StdioServerTransport` → `server.connect`. A throw bubbles to the
  `main().catch(...)` that prints `fatal:` and exits 1.
- `mcp/src/result.ts` — `errorResult(action, err, recovery?)` maps any thrown
  error to the canonical error envelope; `defineTool(...)` wraps every tool
  handler in `try { … } catch (err) { return errorResult(name, err, recovery) }`.
- `mcp/src/error-codes.ts` — **GENERATED** (do not hand-edit); the stable
  error-code registry, `recoveryForCode`, `retryableForCode`.
- `mcp/src/server.ts` — `buildServer(ctx)` registers all 134 tools; every tool
  reads `ctx.client` / `ctx.workspaceId` **only inside its async handler**
  (verified: no register function aliases `ctx.client`/`ctx.workspaceId` at
  registration time — the single `const listGroups = ctx.client...` at
  `mcp/src/tools/groups.ts:62` is inside a handler).

Key excerpts (confirm these match before editing):

`mcp/src/client.ts:66-98` (the throw to remove + happy path to preserve):
```ts
export function loadContext(
    env: NodeJS.ProcessEnv = process.env,
    options: LoadContextOptions = {},
): Context {
    const apiKey = env.CLOCKIFY_API_KEY;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID;
    const environment = env.CLOCKIFY_BASE_URL;
    if (!apiKey) {
        throw new Error(
            "CLOCKIFY_API_KEY is not set. Configure it in your MCP client's env block, e.g.\n" +
                `  "@apet97/clockify-mcp-115": { "command": "clockify115-mcp", "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." } }`,
        );
    }
    if (!workspaceId) {
        throw new Error(
            "CLOCKIFY_WORKSPACE_ID is not set. The one-user server is pinned to a single workspace.",
        );
    }
    const client = createClockifyClient({
        apiKey,
        ...(environment !== undefined ? { environment } : {}),
        ...options,
    });
    return {
        client,
        workspaceId,
        confirmationTokens: new ConfirmationTokenStore(),
        currentUserId: createCurrentUserIdMemo(client),
    };
}
```

`mcp/src/client.ts:14-26` (the `Context` interface — note `client`/`workspaceId`
are required, others optional):
```ts
export interface Context {
    client: ClockifyClient;
    workspaceId: string;
    confirmationTokens?: ConfirmationTokenStore;
    currentUserId?: () => Promise<string>;
}
```

`mcp/src/index.ts:13-18` (entrypoint `main`):
```ts
export async function main(): Promise<void> {
    const ctx = loadContext();
    const server = buildServer(ctx);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
```

`mcp/src/result.ts:150-176` (`errorResult` — the branch goes at the **top**):
```ts
export function errorResult(
    action: string,
    err: unknown,
    recovery?: string | RecoveryHint,
): CallToolResult {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { statusCode?: number }).statusCode;
    const code =
        classifyClockifyError(err)?.code ??
        errorCodeForStatus(status) ??
        errorCodeForMessage(message);
    const envelope: ErrorEnvelope = { ok: false, action, error: { code, message } };
    if (recovery) {
        envelope.recovery = typeof recovery === "string" ? { hint: recovery } : recovery;
    } else {
        envelope.recovery = { hint: recoveryForCode(code), retryable: retryableForCode(code) };
    }
    return {
        content: [{ type: "text", text: JSON.stringify(envelope) }],
        structuredContent: envelope as unknown as JsonRecord,
        isError: true,
    };
}
```

Conventions that apply here:

- **`mcp/src/error-codes.ts` is generated** from `docs/error-codes.json` by
  `scripts/generate-error-docs.mjs` (header line 1 says so). Never hand-edit it.
  The generator writes **all three** package copies: `wrapper/error-codes.ts`,
  `cli/src/error-codes.ts`, `mcp/src/error-codes.ts` (see the generator's
  `tsTargets`).
- **The error-code registry is integrity-gated.** `docs/error-registry-contract.json`
  pins `expectedCodeCount`, `expectedCodeIds`, `reachableCodes`, and
  `reachabilitySources`; `scripts/check-error-registry.mjs` (run by
  `make error-registry`) fails if you add a code without updating the contract.
  A `reachable: true` code with an **empty** `httpStatus` must be "grounded" — a
  reachability source file must literally contain one of `return "<code>"`,
  `code = "<code>"`, `code: "<code>"`, `toBe("<code>")`, or `toEqual("<code>")`.
- **`mcp/src/client.ts` is grepped by the config-precedence gate.**
  `docs/config-precedence-contract.json` surface `mcp-env-only`
  (`scripts/check-config-precedence.mjs`, `make config-precedence`) requires the
  file to contain these literal substrings: `CLOCKIFY_API_KEY is not set`,
  `CLOCKIFY_WORKSPACE_ID is not set`, `one-user server is pinned to a single
  workspace`, `CLOCKIFY_BASE_URL`. **Your new message string must keep all four
  as source literals** or this gate reds.
- **Tool count is unchanged (134).** This plan adds no tool/prompt/resource and
  removes none. `mcp/tests/server.test.ts:243` asserts `toHaveLength(134)`; the
  perf-budgets MCP smoke (`scripts/check-performance-budgets.mjs:366-405`) builds
  the server with a **hand-built fake ctx** (not `loadContext`) and asserts
  `EXPECTED_TOOLS` (read from `docs/mcp-tools.json` summary) — neither is affected.
- Error envelope shape and structuredContent are owned by `errorResult`; reuse it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Root install (once, from repo root) | `npm ci` | exit 0 |
| Populate generated SDK (fresh tree only) | `make sdk-codegen` | exit 0; `wrapper/src/**` populated |
| Build wrapper (needed for mcp type-check) | `npm run build -w clockify-sdk-ts-115` | exit 0 |
| Regenerate error-code registry + copies | `make error-docs` | "wrote docs/error-codes.md and package error-code modules" |
| Regenerate troubleshooting doc | `make troubleshooting` | exit 0 |
| Error-registry integrity gate | `make error-registry` | "error registry integrity passed (17 codes, …)" |
| Error-docs drift gate | `make error-docs-drift` | exit 0, no drift |
| Troubleshooting drift gate | `make troubleshooting-drift` | exit 0, no drift |
| Config-precedence gate | `make config-precedence` | exit 0 |
| MCP type-check | `npm run type-check -w @apet97/clockify-mcp-115` | exit 0, no errors |
| MCP tests | `npm test -w @apet97/clockify-mcp-115` | all pass (incl. new tests) |
| MCP build | `npm run build -w @apet97/clockify-mcp-115` | exit 0 |
| MCP lint | `npm run lint -w @apet97/clockify-mcp-115` | exit 0 |
| Changelog-drift gate | `make changelog-drift` | exit 0 |
| Final full proof (solo, blanked creds) | `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full` | exit 0 |

> Run `make perfect-full` **solo** (no other heavy processes). Its
> `performance-budgets` sub-gate measures startup time and flakes 6–10× over
> budget under CPU contention — a red there means only the startup-time budget
> flaked (the heavy proofs already ran, since it is the last prerequisite);
> re-validate with `make performance-budgets` solo.

## Scope

**In scope** (the only files you should modify):
- `mcp/src/client.ts` — defer the missing-creds throw; add `MissingCredentialsError`.
- `mcp/src/index.ts` — emit a one-line stderr hint when creds are missing; keep starting.
- `mcp/src/result.ts` — map `MissingCredentialsError` → `setup_required` envelope.
- `docs/error-codes.json` — add the `setup_required` registry entry (source of truth).
- `docs/error-registry-contract.json` — bump count/ids/reachable/sources.
- `mcp/src/error-codes.ts`, `wrapper/error-codes.ts`, `cli/src/error-codes.ts` —
  **regenerated only** by `make error-docs`; never hand-edit.
- `docs/error-codes.md`, `docs/troubleshooting.md` — **regenerated only** by
  `make error-docs` / `make troubleshooting`.
- `mcp/tests/client.test.ts` — update the two assertions that expect a throw.
- `mcp/tests/result.test.ts` — add the `setup_required` mapping test.
- `mcp/tests/setup-required.test.ts` (create) — the end-to-end no-creds smoke.
- `mcp/CHANGELOG.md`, `wrapper/CHANGELOG.md`, `cli/CHANGELOG.md` — Unreleased bullets
  (the three error-codes.ts copies change, so all three package scopes are "touched"
  by `make changelog-drift`).

**Out of scope** (do NOT touch, even though they look related):
- `spec/corrected/**`, `output/ts-sdk/**`, `wrapper/src/**` — generated upstream;
  hard-stop per `CLAUDE.md`.
- The 24 tool files under `mcp/src/tools/**` — they read `ctx.client`/`ctx.workspaceId`
  only inside handlers, so the lazy-getter approach needs **no** changes there.
- The base-URL allowlist behavior — a malicious `CLOCKIFY_BASE_URL` must STILL be
  rejected eagerly when creds are present (the happy path builds the client eagerly,
  which runs the allowlist check). Do not move that into a lazy getter.
- `mcp/README.md` "Stable error codes" table and the `clockify://mcp/doctor`
  resource text in `mcp/src/resources.ts` — optional doc polish, deferred (see
  Maintenance notes). They are a curated subset; no gate forces them.
- Any change that adds/removes a tool, prompt, or resource (tool count stays 134).

## Git workflow

- Branch off `main`: `git checkout -b advisor/007-graceful-no-credential-startup`.
- Commit per logical unit (registry+codegen; client/result/index; tests; changelogs).
  Match the repo's conventional-commit style, e.g.
  `feat(mcp): start server without creds and return setup_required per tool`.
- End the commit message body with the trailer the repo uses for sessions
  (`Claude-Session: …`) if you are committing through the harness.
- Do NOT push or open a PR unless the operator instructed it. Do NOT `npm publish`.

## Steps

### Step 1: Add the `setup_required` code to the registry source

Edit `docs/error-codes.json`. Append a new object to the `codes` array (after the
final `"error"` entry). Use exactly:

```json
    {
      "code": "setup_required",
      "httpStatus": [],
      "retry": false,
      "surfaces": [
        "mcp"
      ],
      "meaning": "The MCP server started but required credentials (CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID) are not set, so no Clockify call can be made yet.",
      "recovery": "Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID in the MCP client's env block, then restart the server. Get the API key from Clockify Profile Settings -> API; the workspace ID is in the workspace URL.",
      "reachable": true
    }
```

**Verify**: `node -e "const j=require('./docs/error-codes.json'); console.log(j.codes.length, j.codes.some(c=>c.code==='setup_required'))"`
→ prints `17 true`.

### Step 2: Update the error-registry integrity contract

Edit `docs/error-registry-contract.json`:

- `expectedCodeCount`: `16` → `17`.
- `expectedCodeIds`: add `"setup_required"` to the array.
- `reachableCodes`: add `"setup_required"` to the array (it is `reachable: true`).
- `reachabilitySources`: add `"mcp/src/result.ts"` to the array. (This is where the
  `code: "setup_required"` literal will live after Step 5, satisfying the
  grounding rule for a code with empty `httpStatus`.)

**Verify** (after Step 5 lands the literal): `make error-registry`
→ `error registry integrity passed (17 codes, 3 package copies, 14 reachable codes grounded)`.
(Until Step 5, this gate will report the code as ungrounded — that is expected;
do not "fix" it here.)

### Step 3: Regenerate the generated error-code copies and docs

Do NOT hand-edit any generated file. Run:

```bash
make error-docs
make troubleshooting
```

`make error-docs` rewrites `docs/error-codes.md` and all three package copies
(`wrapper/error-codes.ts`, `cli/src/error-codes.ts`, `mcp/src/error-codes.ts`) to
include `setup_required`. `make troubleshooting` rewrites `docs/troubleshooting.md`.

**Verify**:
- `grep -c '"code": "setup_required"' wrapper/error-codes.ts cli/src/error-codes.ts mcp/src/error-codes.ts` → each `1`.
- `make error-docs-drift` → exit 0 (no drift).
- `make troubleshooting-drift` → exit 0 (no drift).

### Step 4: Defer the missing-creds throw in `mcp/src/client.ts`

Make three edits in `mcp/src/client.ts`.

**(a) Add a dedicated error class** (top-level, after the imports). It must
carry the actionable message and keep the four config-precedence marker literals:

```ts
/**
 * Thrown lazily (at first `ctx.client` / `ctx.workspaceId` access) when the MCP
 * server was started without its required credentials. `defineTool`'s catch maps
 * this to a `setup_required` receipt, so the server stays up and every tool
 * explains the fix instead of the process crashing at startup.
 */
export class MissingCredentialsError extends Error {
    readonly missing: readonly string[];
    constructor(missing: readonly string[]) {
        super(buildSetupMessage(missing));
        this.name = "MissingCredentialsError";
        this.missing = missing;
    }
}

function buildSetupMessage(missing: readonly string[]): string {
    const parts: string[] = [];
    if (missing.includes("CLOCKIFY_API_KEY")) {
        parts.push("CLOCKIFY_API_KEY is not set.");
    }
    if (missing.includes("CLOCKIFY_WORKSPACE_ID")) {
        parts.push(
            "CLOCKIFY_WORKSPACE_ID is not set. The one-user server is pinned to a single workspace.",
        );
    }
    return (
        `Clockify MCP is not configured: ${parts.join(" ")}\n` +
        "Set them in your MCP client's env block, e.g.\n" +
        `  "@apet97/clockify-mcp-115": { "command": "clockify115-mcp", "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." } }\n` +
        "Get the API key from Clockify Profile Settings -> API; the workspace ID is in the workspace URL. Leave CLOCKIFY_BASE_URL unset for live Clockify."
    );
}
```

> The literal strings above contain all four required config-precedence markers
> (`CLOCKIFY_API_KEY is not set`, `CLOCKIFY_WORKSPACE_ID is not set`, `one-user
> server is pinned to a single workspace`, `CLOCKIFY_BASE_URL`) plus
> `@apet97/clockify-mcp-115` and `clockify115-mcp` (asserted by
> `mcp/tests/client.test.ts`). Keep them.

**(b) Add the optional `setupError` field to `Context`** so the entrypoint can
emit a one-line hint without re-reading env. It is optional, so hand-built test
contexts (server.test.ts, perf-budgets smoke) keep compiling:

```ts
export interface Context {
    client: ClockifyClient;
    workspaceId: string;
    confirmationTokens?: ConfirmationTokenStore;
    currentUserId?: () => Promise<string>;
    /**
     * Present only when the server started without required credentials. The
     * server still runs; every tool returns a `setup_required` receipt because
     * `client` / `workspaceId` throw `MissingCredentialsError` on access.
     */
    setupError?: MissingCredentialsError;
}
```

**(c) Replace the two `throw`s with a deferred context.** Keep the happy path
byte-for-byte (eager build still runs the base-URL allowlist check):

```ts
export function loadContext(
    env: NodeJS.ProcessEnv = process.env,
    options: LoadContextOptions = {},
): Context {
    const apiKey = env.CLOCKIFY_API_KEY;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID;
    const environment = env.CLOCKIFY_BASE_URL;

    const missing: string[] = [];
    if (!apiKey) missing.push("CLOCKIFY_API_KEY");
    if (!workspaceId) missing.push("CLOCKIFY_WORKSPACE_ID");
    if (missing.length > 0) {
        // Deferred: the server still starts; each tool throws on first
        // client/workspace access, which defineTool maps to setup_required.
        return makeSetupRequiredContext(new MissingCredentialsError(missing));
    }

    // createClockifyClient enforces the Clockify host allowlist on the resolved
    // base URL, so a malicious CLOCKIFY_BASE_URL is rejected here, eagerly,
    // before any request leaves the process.
    const client = createClockifyClient({
        apiKey,
        ...(environment !== undefined ? { environment } : {}),
        ...options,
    });
    return {
        client,
        workspaceId,
        confirmationTokens: new ConfirmationTokenStore(),
        currentUserId: createCurrentUserIdMemo(client),
    };
}

function makeSetupRequiredContext(error: MissingCredentialsError): Context {
    const fail = (): never => {
        throw error;
    };
    return {
        get client(): ClockifyClient {
            return fail();
        },
        get workspaceId(): string {
            return fail();
        },
        confirmationTokens: new ConfirmationTokenStore(),
        setupError: error,
    };
}
```

> Note: in the setup-required context `currentUserId` is intentionally omitted —
> tools that use it fall back to `ctx.client.users.getCurrentUser()`, which hits
> the throwing `client` getter, so they still produce `setup_required`.

**Verify**: `npm run build -w clockify-sdk-ts-115 && npm run type-check -w @apet97/clockify-mcp-115` → exit 0.

### Step 5: Map `MissingCredentialsError` → `setup_required` in `mcp/src/result.ts`

Add an import at the top of `mcp/src/result.ts` (with the other local imports):

```ts
import { MissingCredentialsError } from "./client.js";
```

> No import cycle: `client.ts` imports only the SDK + `orchestration/confirmation.js`
> (which imports only `node:crypto`); it does not import `result.js`.

Then add this branch as the **first statement** inside `errorResult`, before the
`const message = …` line:

```ts
    if (err instanceof MissingCredentialsError) {
        const envelope: ErrorEnvelope = {
            ok: false,
            action,
            error: { code: "setup_required", message: err.message },
            recovery: { hint: recoveryForCode("setup_required"), retryable: false },
        };
        return {
            content: [{ type: "text", text: JSON.stringify(envelope) }],
            structuredContent: envelope as unknown as JsonRecord,
            isError: true,
        };
    }
```

> The literal `code: "setup_required"` here is what grounds the registry's
> reachability check (Step 2 added `mcp/src/result.ts` to `reachabilitySources`).
> `recoveryForCode("setup_required")` type-checks only after Step 3 regenerated
> `mcp/src/error-codes.ts`, so keep the step order.

**Verify**: `npm run type-check -w @apet97/clockify-mcp-115` → exit 0; then
`make error-registry` → `error registry integrity passed (17 codes, 3 package copies, 14 reachable codes grounded)`.

### Step 6: Emit a one-line stderr hint in `mcp/src/index.ts` (keep starting)

Change `main()` to surface the hint to **stderr only** (stdout must stay clean
JSON-RPC) and continue starting the server:

```ts
export async function main(): Promise<void> {
    const ctx = loadContext();
    if (ctx.setupError) {
        // Diagnostics go to stderr; stdout is reserved for JSON-RPC. The model
        // still gets the full remediation via each tool's setup_required receipt.
        process.stderr.write(`setup: ${ctx.setupError.message}\n`);
    }
    const server = buildServer(ctx);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
```

Leave the `main().catch(...)` block (`mcp/src/index.ts:26-32`) unchanged — it now
only fires for genuinely unexpected startup errors, not for missing creds.

**Verify**: `npm run type-check -w @apet97/clockify-mcp-115` → exit 0.

### Step 7: Update the tests that assumed a startup crash

Edit `mcp/tests/client.test.ts`. The first test block (lines 6-17) currently
asserts `loadContext({})` **throws**. Replace the two throwing assertions with the
new no-throw / deferred-throw behavior. Target shape:

```ts
import { MissingCredentialsError, createCurrentUserIdMemo, loadContext } from "../src/client.js";
// ...
    it("does not throw on missing env; defers to a setup_required context", () => {
        const ctx = loadContext({});
        expect(ctx.setupError).toBeInstanceOf(MissingCredentialsError);
        expect(ctx.setupError?.message).toMatch(/@apet97\/clockify-mcp-115/);
        expect(ctx.setupError?.message).toMatch(/clockify115-mcp/);
        // The throw is deferred to first client/workspace access.
        expect(() => ctx.client).toThrow(MissingCredentialsError);
        expect(() => ctx.workspaceId).toThrow(MissingCredentialsError);
    });
```

Keep the existing `isDirectInvocation` test and the H1 base-URL allowlist tests
(lines 72-112) **unchanged** — those exercise the creds-present path and must
still throw eagerly.

> Do NOT change `mcp/tests/error-codes.test.ts:26`
> (`errorCodeForMessage("CLOCKIFY_API_KEY is not set")` → `auth_or_permission`).
> That tests the message-regex matcher, which our `instanceof` branch bypasses;
> it stays valid.

### Step 8: Add the `setup_required` mapping unit test

In `mcp/tests/result.test.ts`, inside the existing `describe("errorResult")`
block, add:

```ts
    it("maps a MissingCredentialsError to a setup_required envelope", () => {
        const out = errorResult("clockify_status", new MissingCredentialsError(["CLOCKIFY_API_KEY"]));
        expect(out.isError).toBe(true);
        const parsed = JSON.parse((out.content as Array<{ text: string }>)[0].text);
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe("setup_required");
        expect(parsed.error.message).toMatch(/CLOCKIFY_API_KEY is not set/);
        expect(parsed.recovery.retryable).toBe(false);
    });
```

Add the import at the top of the file:
`import { MissingCredentialsError } from "../src/client.js";`

### Step 9: Add the end-to-end no-creds smoke test (create file)

Create `mcp/tests/setup-required.test.ts`. It must prove: the server connects a
transport with **no** creds and a tool returns `setup_required` (not a crash).
Model it on the `connect` helper in `mcp/tests/server.test.ts:66-77`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadContext } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};
afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

describe("MCP starts without credentials", () => {
    it("connects the transport and a tool returns setup_required (no crash)", async () => {
        const ctx = loadContext({}); // no CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID
        const server = buildServer(ctx); // must not throw — all 134 tools register
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "setup-smoke", version: "0.0.0" });
        await client.connect(clientTransport);
        teardown = async () => {
            await client.close();
            await server.close();
        };

        // The server is up and advertises its full surface.
        expect((await client.listTools()).tools.length).toBe(134);

        // Any tool that needs Clockify returns the friendly setup receipt.
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0].text);
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe("setup_required");
        expect(parsed.error.message).toMatch(/clockify115-mcp/);
    });
});
```

**Verify**: `npm test -w @apet97/clockify-mcp-115` → all pass, including the three
new/updated tests.

### Step 10: Build + lint + add changelog entries

```bash
npm run build -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
```

Then add an **Unreleased** bullet to each touched package changelog (the three
generated `error-codes.ts` copies make all three scopes "touched"):

- `mcp/CHANGELOG.md` (under `## [Unreleased]`, e.g. an `### Added` section):
  "The MCP server now starts even when `CLOCKIFY_API_KEY`/`CLOCKIFY_WORKSPACE_ID`
  are unset; every tool returns a `setup_required` receipt with the exact fix
  instead of the process crashing at startup."
- `wrapper/CHANGELOG.md` and `cli/CHANGELOG.md`: a short bullet noting the shared
  error registry gained the `setup_required` code (regenerated copy).

**Verify**: `make changelog-drift` → exit 0.

### Step 11: Run the gates touched by this change, then the full proof

```bash
make error-registry
make error-docs-drift
make troubleshooting-drift
make config-precedence
npm run type-check -w @apet97/clockify-mcp-115
npm test -w @apet97/clockify-mcp-115
npm run lint -w @apet97/clockify-mcp-115
```

All exit 0. Then run the full proof **solo**:

```bash
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full
echo "perfect-full exit: $?"
```

→ exit 0. (If only `performance-budgets` reds, re-run `make performance-budgets`
solo to confirm it was a startup-time flake, per the note in Commands.)

## Test plan

- `mcp/tests/client.test.ts` (modify): `loadContext({})` no longer throws; returns
  a context whose `setupError` is a `MissingCredentialsError` and whose `client`/
  `workspaceId` getters throw on access. Keep the H1 base-URL allowlist tests
  (creds-present path still throws eagerly).
- `mcp/tests/result.test.ts` (modify): a `MissingCredentialsError` passed to
  `errorResult` yields `{ ok:false, error.code:"setup_required", recovery.retryable:false }`.
- `mcp/tests/setup-required.test.ts` (create): full no-creds smoke — server
  connects, lists 134 tools, and `clockify_status` returns `setup_required`
  (not a crash). This is the headline acceptance test for this plan.
- Structural pattern: model the smoke on `mcp/tests/server.test.ts`'s `connect`
  helper and its `callTool` + `JSON.parse(content[0].text)` assertions.
- Verification: `npm test -w @apet97/clockify-mcp-115` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node -e "console.log(require('./docs/error-codes.json').codes.length)"` prints `17`.
- [ ] `make error-registry` → `… (17 codes, 3 package copies, 14 reachable codes grounded)`.
- [ ] `make error-docs-drift` and `make troubleshooting-drift` → exit 0.
- [ ] `make config-precedence` → exit 0 (the four `mcp-env-only` markers still present in `mcp/src/client.ts`).
- [ ] `npm run type-check -w @apet97/clockify-mcp-115` → exit 0.
- [ ] `npm test -w @apet97/clockify-mcp-115` → all pass, including the new
      `setup-required.test.ts` and the updated `client`/`result` tests.
- [ ] `npm run build -w @apet97/clockify-mcp-115` and `npm run lint -w @apet97/clockify-mcp-115` → exit 0.
- [ ] `make changelog-drift` → exit 0.
- [ ] `grep -n 'process.exit(1)' mcp/src/index.ts` still present **only** in the
      `main().catch` block — `main()` itself no longer exits for missing creds.
- [ ] `grep -rn 'throw new Error("CLOCKIFY_API_KEY is not set' mcp/src/client.ts` → no match (the eager throws are gone).
- [ ] `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full` → exit 0 (solo).
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the "Current state" excerpts does not match the live files (drift
  since commit `7c3a84c`).
- `make error-registry` reports a count other than the expected one, or grounding
  fails after Step 5 — do NOT loosen the contract or change a code's `reachable`
  flag to make it pass.
- Any gate fails citing a **hardcoded error-code count or id-set you were not told
  to change** (e.g. an audit/observability/support-bundle contract pins the code
  set) — report which contract and which assertion.
- `make config-precedence` reds — a required marker literal was dropped from
  `mcp/src/client.ts`; restore it rather than editing the contract.
- A TypeScript circular-import error appears between `result.ts` and `client.ts`
  (it should not — see Step 5 note). Report it instead of restructuring modules.
- `mcp/tests/server.test.ts:243` (`toHaveLength(134)`) or the perf-budgets tool
  count fails — that means the tool surface changed, which is out of scope.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require editing any file under
  `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**` (hard stop), or a
  tool file under `mcp/src/tools/**`.

## Maintenance notes

For the human/agent who owns this after it lands:

- **Reviewer focus**: (1) the happy path in `loadContext` is unchanged and still
  builds the client eagerly (so a malicious `CLOCKIFY_BASE_URL` is still rejected
  at startup when creds are present); (2) stdout stays clean — the only new write
  is `process.stderr.write` in `index.ts`; (3) the four config-precedence marker
  literals survive in `client.ts`.
- **Gate cascade (MED)**: adding one error code touches the registry source +
  contract + three regenerated `*.ts` copies + two regenerated docs + three
  changelogs. Tool count is **unchanged (134)**, so none of the tool-count
  surfaces (`docs/mcp-tools.json`, `mcp-tool-manifest`, readme tables,
  `performance-budgets` EXPECTED_TOOLS, `docs-counts` forbiddenStrings) move — do
  not regenerate those.
- **Deferred polish (intentionally out of scope)**: enrich the
  `clockify://mcp/doctor` resource (`mcp/src/resources.ts`) and the curated
  "Stable error codes" table in `mcp/README.md` to mention `setup_required`. These
  are docs-only and gate-free; fold them into a later docs pass if desired.
- **Mutation/coverage**: `mcp/src/result.ts` and the new client code are within the
  mutation/coverage gates (`make mutation`, `make coverage`, both in
  `perfect-full`). The added tests (Steps 8-9) should kill the new mutants and
  hold coverage; if `make mutation` reports a survivor on the new branch, add a
  targeted assertion rather than lowering a floor.
- **Future interaction**: if a future change makes `currentUserId` non-optional on
  `Context`, the setup-required context (which omits it) must add a throwing stub
  so tools still resolve to `setup_required`.
