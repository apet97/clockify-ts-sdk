# Plan 008: Make `clockify_status` (and a shared resolver) return failure-class-aware recovery hints

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
>   mcp/src/tools/status.ts mcp/src/result.ts mcp/src/error-codes.ts \
>   mcp/tests/result.test.ts mcp/tests/server.test.ts wrapper/errors.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `7c3a84c`, 2026-06-26

## Why this matters

When `clockify_status` fails, it returns one static recovery hint
(`"Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid."`,
`mcp/src/tools/status.ts:51`) regardless of *why* it failed. A first-time
operator cannot tell a `401` (bad/expired API key) from a `404`/wrong-workspace
(wrong 24-char workspace id) from a network/timeout error — three failures with
three completely different fixes. `clockify_status` is the documented **first
call** every agent makes (`mcp/src/server.ts:39`, `mcp/src/resources.ts`), so a
vague hint there is the worst place for one. This plan adds a small **pure**
mapping from the already-classified error code to a class-specific, actionable
remediation hint, wires it into `clockify_status`, and exposes it as a shared
seam (`RecoveryResolver`) so any future doctor tool reuses the same mapping
without copying a `try/catch`. No new error codes, no new tools — the tool count
stays 134.

## Current state

Files and their roles:

- `mcp/src/tools/status.ts` — registers `clockify_status`; passes ONE static
  recovery string as the 5th arg to `defineTool` (line 51). That string is the
  only remediation surfaced no matter the failure class.
- `mcp/src/result.ts` — owns the success/error envelope + the `defineTool`
  registration seam. `errorResult` derives the stable error `code` and, when no
  explicit `recovery` is passed, fills `recovery` from the registry
  (`recoveryForCode`/`retryableForCode`). `defineTool` wraps every handler in a
  `try/catch` and calls `errorResult(name, err, recovery)`.
- `mcp/src/error-codes.ts` — generated registry: `ClockifyErrorCode` union,
  `errorCodeForStatus`, `errorCodeForMessage`, `recoveryForCode`,
  `retryableForCode`. **Generated file — do NOT hand-edit** (regenerated from
  `docs/error-codes.json` via `make error-docs`).
- `wrapper/errors.ts` (SDK, subpath `clockify-sdk-ts-115/errors`) —
  `classifyClockifyError(err)` does cause-aware, status-first classification and
  returns `{ code, recovery, retryable, ... }` or `undefined` for non-SDK
  errors. Also exports the typed subclasses (`ClockifyConnectionError`, etc.).

The exact `errorResult` derivation + recovery logic today (`mcp/src/result.ts`,
around lines 150–176):

```ts
export function errorResult(
    action: string,
    err: unknown,
    recovery?: string | RecoveryHint,
): CallToolResult {
    const message = err instanceof Error ? err.message : String(err);
    // Prefer the SDK's cause-aware classifier: a connection/abort error (statusCode
    // null) must not be mislabeled by the message-regex fallback ...
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
    return { content: [...], structuredContent: ..., isError: true };
}
```

`defineTool` signature today (`mcp/src/result.ts:226-244`): its `recovery?:
string | RecoveryHint` is forwarded verbatim into `errorResult` inside the
catch.

The `clockify_status` registration today (`mcp/src/tools/status.ts:7-52`) ends
with:

```ts
        "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid.",
    );
}
```

### Repo conventions that apply here

- **Stable error codes are the vocabulary.** Reuse the existing
  `ClockifyErrorCode` union — do NOT invent codes. Classification precedence is
  fixed: `classifyClockifyError` (SDK, cause-aware) → `errorCodeForStatus` →
  `errorCodeForMessage`. Your new code must classify identically to
  `errorResult`, so derive through the **same** helper (see Step 1).
- **Tools may pass arbitrary recovery text.** `errorResult` already accepts a
  free-form `recovery` string/object (e.g. `webhook URL must use HTTPS` in
  `mcp/tests/result.test.ts:146`), so a richer per-class hint is in-pattern and
  trips no docs/registry gate. Verified: no gate binds a tool's recovery text to
  `docs/error-codes.json` — `scripts/check-error-registry.mjs` pins the registry
  JSON shape only.
- **Pure, unit-testable helpers** live as small modules under `mcp/src/`; tests
  mirror them 1:1 under `mcp/tests/` (see `mcp/tests/error-codes.test.ts` for the
  one-assertion-per-branch style to copy).
- **ESM `.js` import specifiers** even for `.ts` sources (e.g.
  `from "./error-codes.js"`). Lint enforces import ordering (eslint
  `import-x`) — run `npm run lint -w @apet97/clockify-mcp-115` and let
  `lint:fix` sort if needed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build the SDK wrapper (consumed by mcp types) | `npm run build -w clockify-sdk-ts-115` | exit 0 |
| MCP type-check | `npm run type-check -w @apet97/clockify-mcp-115` | exit 0, no errors |
| MCP tests | `npm test -w @apet97/clockify-mcp-115` | all pass (incl. new tests) |
| Run only the new/changed tests | `cd mcp && npx vitest run tests/diagnose.test.ts tests/result.test.ts tests/server.test.ts` | all pass |
| MCP lint (NOT in type-check/test) | `npm run lint -w @apet97/clockify-mcp-115` | exit 0 |
| MCP build | `npm run build -w @apet97/clockify-mcp-115` | exit 0 |
| Final full proof (SOLO) | `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` | make exits 0 |

Notes:
- If `wrapper/src/**` or `wrapper/dist/**` is absent (fresh clone), run
  `make sdk-codegen` then `npm run build -w clockify-sdk-ts-115` FIRST, or
  `type-check` will report phantom missing exports from `clockify-sdk-ts-115/*`.
- `make perfect-fast` is load-flaky on the startup-time `performance-budgets`
  sub-gate — run it **solo**, with creds blanked (above). A red there with the
  rest green means only the startup-time budget flaked; re-run solo.

## Scope

**In scope** (the only files you should modify/create):
- `mcp/src/diagnose.ts` (**create** — the pure mapping)
- `mcp/src/result.ts` (extract a shared code-deriver; add `RecoveryResolver`
  support to `errorResult` + `defineTool`)
- `mcp/src/tools/status.ts` (wire the resolver in)
- `mcp/tests/diagnose.test.ts` (**create**)
- `mcp/tests/result.test.ts` (add resolver tests)
- `mcp/tests/server.test.ts` (add one integration test — recommended)
- `mcp/CHANGELOG.md` (add an Unreleased entry — required by `make changelog-drift`)

**Out of scope** (do NOT touch, even though they look related):
- `mcp/src/error-codes.ts`, `wrapper/error-codes.ts`, `docs/error-codes.json` —
  generated registry. This plan adds NO new codes, so none of these change. If
  you find yourself wanting a new code, that is a STOP condition.
- `wrapper/errors.ts` / `wrapper/src/**` / `output/ts-sdk/**` /
  `spec/corrected/**` — SDK + generated; read-only here.
- Any other MCP tool — do not retrofit other tools onto the resolver in this
  plan; that is a follow-up (see Maintenance notes).
- `docs/mcp-tools.json`, `mcp/README.md` tables, `docs/performance-budgets.json`,
  `docs/product-surface.*` — **no tool/prompt count change**, so these stay as-is.

## Git workflow

- Branch: `advisor/008-failure-class-aware-error-hints`.
- Commit per logical unit (e.g. "result seam", "diagnose module + status wiring",
  "tests"). Conventional-commit style matches the repo, e.g.
  `feat(mcp): failure-class-aware recovery hints in clockify_status`.
- End the commit message body with the `Claude-Session:` trailer if your harness
  adds one. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract a single source of truth for the error code in `result.ts`

In `mcp/src/result.ts`, add `type ClockifyErrorCode` to the existing
`./error-codes.js` import:

```ts
import {
    errorCodeForMessage,
    errorCodeForStatus,
    recoveryForCode,
    retryableForCode,
    type ClockifyErrorCode,
} from "./error-codes.js";
```

Add an exported function (place it just above `errorResult`) that hoists the
exact derivation currently inline in `errorResult`, with the explanatory comment
moved onto it:

```ts
/**
 * Derive the stable cross-surface error code from any thrown value, using the
 * SAME precedence errorResult applies: the SDK's cause-aware classifier first
 * (so a connection/abort error with statusCode null is never mislabeled by the
 * message-regex fallback — e.g. a network failure whose message contains
 * "workspace" stays connection_error, not auth_or_permission), then HTTP-status
 * mapping, then the message matcher. Exported so failure-class hint mappers
 * (mcp/src/diagnose.ts) classify identically to the error envelope.
 */
export function errorCodeForError(err: unknown): ClockifyErrorCode {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { statusCode?: number }).statusCode;
    return (
        classifyClockifyError(err)?.code ??
        errorCodeForStatus(status) ??
        errorCodeForMessage(message)
    );
}
```

Then change `errorResult` to (a) call it and (b) accept a resolver. The body
becomes:

```ts
export function errorResult(
    action: string,
    err: unknown,
    recovery?: string | RecoveryHint | RecoveryResolver,
): CallToolResult {
    const message = err instanceof Error ? err.message : String(err);
    const code = errorCodeForError(err);
    const envelope: ErrorEnvelope = { ok: false, action, error: { code, message } };
    if (recovery) {
        const resolved = typeof recovery === "function" ? recovery(err, code) : recovery;
        envelope.recovery = typeof resolved === "string" ? { hint: resolved } : resolved;
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

Add the resolver type near the other exported interfaces (e.g. just after the
`RecoveryHint` interface, ~line 100):

```ts
/**
 * A failure-class-aware recovery resolver: given the thrown error and its
 * already-derived stable code, returns a tailored recovery hint. Lets a tool
 * emit a class-specific remediation (401 vs wrong-workspace vs network) without
 * owning its own try/catch — pass it as the `recovery` argument to defineTool.
 */
export type RecoveryResolver = (err: unknown, code: ClockifyErrorCode) => string | RecoveryHint;
```

Finally widen the `recovery` parameter type on `defineTool` (no other change to
that function — it still forwards `recovery` into `errorResult`):

```ts
export function defineTool<InputArgs extends ZodRawShapeCompat = ZodRawShapeCompat>(
    server: McpServer,
    name: string,
    config: ToolConfig<InputArgs>,
    handler: ToolHandler<InputArgs>,
    recovery?: string | RecoveryHint | RecoveryResolver,
): void {
```

**Verify**: `npm run type-check -w @apet97/clockify-mcp-115` → exit 0, no errors.
(The `defineTool` call shape `defineTool(server, "...")` is unchanged, so
`scripts/check-mcp-write-safety.mjs` / `generate-operation-parity` matchers stay
valid — do not alter the first three positional args.)

### Step 2: Create the pure mapping module `mcp/src/diagnose.ts`

Create `mcp/src/diagnose.ts`:

```ts
/**
 * Failure-class-aware recovery hints. Pure mapping from a stable error code to a
 * first-timer-actionable remediation string for the MCP surface. Shared by
 * clockify_status (and any future doctor tool) via the RecoveryResolver seam in
 * result.ts. No network, no I/O — unit-testable in isolation.
 */
import { recoveryForCode, retryableForCode, type ClockifyErrorCode } from "./error-codes.js";
import { errorCodeForError, type RecoveryHint } from "./result.js";

/**
 * Per-class remediation text, richer / more onboarding-oriented than the generic
 * docs/error-codes.json `recovery` field. Codes not listed here fall back to the
 * registry recovery string in failureHint(). Add codes here, never new codes to
 * the registry.
 */
export const FAILURE_HINTS: Partial<Record<ClockifyErrorCode, string>> = {
    auth_or_permission:
        "Authentication failed (HTTP 401/403). Regenerate your API key in Clockify > Profile Settings > API, set it as CLOCKIFY_API_KEY, and restart the MCP server. If the key is valid, your Clockify role or plan may lack permission for this workspace.",
    not_found:
        "Workspace or resource not found (HTTP 404). Confirm CLOCKIFY_WORKSPACE_ID is the 24-character workspace id (Clockify > Workspace Settings, or the id in the workspace URL) — a wrong or foreign id reads as not-found.",
    connection_error:
        "Could not reach Clockify before any HTTP response. Check network, DNS, TLS, and any HTTPS proxy; if CLOCKIFY_BASE_URL is set, confirm it points at a real Clockify host. Retry with backoff.",
    rate_limited:
        "Clockify rate-limited the request (HTTP 429). Wait for the Retry-After / X-RateLimit-Reset window, then retry once.",
    rate_limited_retry_after:
        "Clockify rate-limited the request (HTTP 429) and named a retry window. Read Retry-After (seconds) or X-RateLimit-Reset (epoch) from the response headers, wait that long, then retry once.",
    clockify_upstream_error:
        "Clockify returned a server-side error (HTTP 5xx). This is usually transient — retry with backoff; preserve the request id for support if it persists.",
    aborted:
        "The request was cancelled before completing. Re-run the tool when ready; do not auto-retry a caller cancellation.",
    feature_unavailable:
        "The endpoint exists but this workspace's plan or feature configuration does not expose it (HTTP 402). Use a supported plan, or skip the gated workflow.",
};

/** Re-derive the stable code with the same precedence errorResult uses. */
export function failureCode(err: unknown): ClockifyErrorCode {
    return errorCodeForError(err);
}

/**
 * Map a thrown error (or its already-derived code) to a failure-class-aware
 * recovery hint. Pass as the `recovery` resolver to defineTool, or call directly
 * with just `err` (e.g. from a future doctor tool).
 */
export function failureHint(
    err: unknown,
    code: ClockifyErrorCode = failureCode(err),
): RecoveryHint {
    return {
        hint: FAILURE_HINTS[code] ?? recoveryForCode(code),
        retryable: retryableForCode(code),
    };
}
```

Note on import direction (no cycle): `diagnose.ts` imports values from
`result.ts` and `error-codes.ts`; neither imports `diagnose.ts`. The dependency
DAG is `status.ts → {result.ts, diagnose.ts}` and `diagnose.ts → {result.ts,
error-codes.ts}` — acyclic.

**Verify**: `npm run type-check -w @apet97/clockify-mcp-115` → exit 0, no errors.

### Step 3: Wire the resolver into `clockify_status`

In `mcp/src/tools/status.ts`:

1. Add the import (place it to satisfy import ordering — `../diagnose.js` sorts
   before `../result.js`):
   ```ts
   import { failureHint } from "../diagnose.js";
   import { defineTool, entityId, successResult } from "../result.js";
   ```
2. Replace the static 5th argument to `defineTool` (line 51) with the resolver:
   ```ts
           failureHint,
       );
   }
   ```

That is the entire wiring: `defineTool`'s catch now calls `errorResult(name,
err, failureHint)`, which invokes `failureHint(err, code)` and emits the
class-specific hint. The happy path is untouched.

**Verify**:
```bash
npm run type-check -w @apet97/clockify-mcp-115   # exit 0
grep -n "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID" mcp/src/tools/status.ts  # no match (old static hint gone)
```

### Step 4: Add the unit tests for the mapping (`mcp/tests/diagnose.test.ts`)

Create `mcp/tests/diagnose.test.ts`, one assertion group per failure class.
Model the style after `mcp/tests/error-codes.test.ts`. Use `ClockifyConnectionError`
from the SDK errors subpath for the cause-aware path (as
`mcp/tests/result.test.ts:3` does), and plain `Object.assign(new Error(...),
{ statusCode })` for HTTP-status cases:

```ts
import { ClockifyConnectionError } from "clockify-sdk-ts-115/errors";
import { describe, expect, it } from "vitest";

import { FAILURE_HINTS, failureCode, failureHint } from "../src/diagnose.js";

const http = (status: number, message = "x") => Object.assign(new Error(message), { statusCode: status });

describe("failureCode", () => {
    it("classifies HTTP status the same way errorResult does", () => {
        expect(failureCode(http(401))).toBe("auth_or_permission");
        expect(failureCode(http(403))).toBe("auth_or_permission");
        expect(failureCode(http(404))).toBe("not_found");
        expect(failureCode(http(429))).toBe("rate_limited");
        expect(failureCode(http(402))).toBe("feature_unavailable");
        expect(failureCode(http(409))).toBe("conflict");
        expect(failureCode(http(500))).toBe("clockify_upstream_error");
        expect(failureCode(http(503))).toBe("clockify_upstream_error");
    });

    it("uses the SDK cause-aware classifier for a connection error (statusCode null)", () => {
        const err = new ClockifyConnectionError({ message: "request to workspace API failed", cause: new Error("ENOTFOUND") });
        expect(failureCode(err)).toBe("connection_error");
    });

    it("falls back to the message matcher for non-SDK aborts", () => {
        expect(failureCode(new Error("operation aborted"))).toBe("aborted");
    });
});

describe("failureHint", () => {
    it("gives a 401/403 hint that points at Profile > API key", () => {
        const out = failureHint(http(401));
        expect(out.hint).toBe(FAILURE_HINTS.auth_or_permission);
        expect(out.hint).toContain("Profile");
        expect(out.retryable).toBe(false);
    });

    it("gives a 404 hint that points at the 24-character workspace id", () => {
        const out = failureHint(http(404));
        expect(out.hint).toContain("24-character workspace id");
        expect(out.retryable).toBe(false);
    });

    it("gives a network hint and marks it retryable", () => {
        const err = new ClockifyConnectionError({ message: "fetch failed", cause: new Error("ECONNRESET") });
        const out = failureHint(err);
        expect(out.hint).toBe(FAILURE_HINTS.connection_error);
        expect(out.retryable).toBe(true);
    });

    it("gives a rate-limit hint and marks it retryable", () => {
        const out = failureHint(http(429));
        expect(out.hint).toBe(FAILURE_HINTS.rate_limited);
        expect(out.retryable).toBe(true);
    });

    it("gives a 5xx upstream hint and marks it retryable", () => {
        expect(failureHint(http(500)).retryable).toBe(true);
        expect(failureHint(http(500)).hint).toBe(FAILURE_HINTS.clockify_upstream_error);
    });

    it("falls back to the registry recovery for a code without a custom hint", () => {
        // 409 -> conflict, which is NOT in FAILURE_HINTS, so the registry text wins.
        const out = failureHint(http(409));
        expect(out.hint).not.toBe(""); // registry recoveryForCode("conflict")
        expect(FAILURE_HINTS.conflict).toBeUndefined();
        expect(out.retryable).toBe(false);
    });

    it("honors an explicitly supplied code (doctor-tool path)", () => {
        expect(failureHint(http(500), "auth_or_permission").hint).toBe(FAILURE_HINTS.auth_or_permission);
    });
});
```

> Coverage note: `mcp/vitest.config.ts` includes `src/**/*.ts`, so `diagnose.ts`
> is measured against the mcp floor (branches 69). Keep both branches of the
> `FAILURE_HINTS[code] ?? recoveryForCode(code)` expression exercised — the
> "falls back to the registry recovery" case above covers the right-hand side.

**Verify**: `cd mcp && npx vitest run tests/diagnose.test.ts` → all pass.

### Step 5: Add resolver tests to `mcp/tests/result.test.ts`

Append to the existing `describe("errorResult", ...)` block (the new
`RecoveryResolver` branch is in the Stryker-mutated `result.ts`, so it MUST be
covered to keep mutation green):

```ts
    it("calls a RecoveryResolver with (err, code) and uses its returned hint", () => {
        const seen: Array<{ err: unknown; code: string }> = [];
        const err = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
        const out = errorResult("clockify_status", err, (e, code) => {
            seen.push({ err: e, code });
            return { hint: "regenerate the key", retryable: false };
        });
        expect(seen).toHaveLength(1);
        expect(seen[0]!.err).toBe(err);
        expect(seen[0]!.code).toBe("auth_or_permission");
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.recovery).toEqual({ hint: "regenerate the key", retryable: false });
    });

    it("wraps a resolver that returns a bare string into {hint}", () => {
        const out = errorResult(
            "x",
            Object.assign(new Error("nope"), { statusCode: 404 }),
            (_e, code) => `code is ${code}`,
        );
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.recovery).toEqual({ hint: "code is not_found" });
    });
```

Also add a tiny test that the extracted deriver is exported and classifies
correctly (import `errorCodeForError` at the top of the file alongside the
existing imports):

```ts
    it("errorCodeForError derives the stable code with errorResult's precedence", () => {
        expect(errorCodeForError(Object.assign(new Error("x"), { statusCode: 403 }))).toBe("auth_or_permission");
        expect(errorCodeForError("plain string")).toBe("error");
    });
```

(Put the last `it` in whichever `describe` you prefer, or a new
`describe("errorCodeForError", ...)`. Update the import line:
`import { defineTool, errorCodeForError, errorResult, successResult, type ToolHandler } from "../src/result.js";`.)

**Verify**: `cd mcp && npx vitest run tests/result.test.ts` → all pass.

### Step 6: Add an integration test for `clockify_status` (recommended)

Add one test to `mcp/tests/server.test.ts` that drives the full tool through a
throwing client and asserts the class-specific hint reaches the wire. The
existing `fakeContext()` does not let you override `getCurrentUser`, so build a
minimal `Context` inline:

```ts
    it("clockify_status returns a 401-class recovery hint when auth fails", async () => {
        const ctx = {
            workspaceId: "ws-1",
            client: {
                users: {
                    getCurrentUser: async () => {
                        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
                    },
                },
                timeEntries: { listInProgress: async () => [] },
            },
        } as unknown as Context;
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
        expect(parsed.error.code).toBe("auth_or_permission");
        expect(parsed.recovery.hint).toContain("Profile");
        expect(parsed.recovery.retryable).toBe(false);
    });
```

**Verify**: `cd mcp && npx vitest run tests/server.test.ts` → all pass.

### Step 7: Record the change in `mcp/CHANGELOG.md`

Under the existing `## [Unreleased]` heading, add to the appropriate section
(create a `### Changed` subsection if one is not already there for this kind of
entry):

```markdown
- `clockify_status` now returns a failure-class-aware recovery hint: a `401`/`403`
  points at regenerating the API key (Clockify > Profile Settings > API), a
  `404`/wrong-workspace points at the 24-character workspace id, and a
  network/timeout failure points at connectivity/proxy — instead of one static
  "verify your credentials" string. The mapping lives in `mcp/src/diagnose.ts`
  (`failureHint`) and is reusable via the new `RecoveryResolver` seam in
  `mcp/src/result.ts`. No new error codes; tool count unchanged (134).
```

**Verify**: `make changelog-drift` → exit 0 (the mcp scope was touched and its
changelog was updated).

### Step 8: Lint, build, and full proof

```bash
npm run lint -w @apet97/clockify-mcp-115          # exit 0 (fix import ordering if flagged: npm run lint:fix -w @apet97/clockify-mcp-115)
npm run build -w @apet97/clockify-mcp-115         # exit 0
```

Then the full deterministic proof, SOLO (no other heavy processes):

```bash
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast
```

**Verify**: `make perfect-fast` exits 0. If only the `performance-budgets`
startup-time sub-gate is red while everything else is green, that is the known
load flake — re-run solo (it does not measure this change; `mcp/dist/index.js`
is unaffected because `diagnose.ts` is a separate compiled file, and the tools
list still advertises exactly 134).

## Test plan

- **New** `mcp/tests/diagnose.test.ts`: `failureCode` precedence (401/403/404/429/
  402/409/500/503, SDK connection error, message-based abort) and `failureHint`
  per class (auth points at Profile/API key; 404 points at the 24-char workspace
  id; connection/rate-limit/5xx are retryable; the registry-fallback branch for a
  code with no custom hint; the explicit-code doctor path).
- **Edit** `mcp/tests/result.test.ts`: resolver is called with `(err, code)` and
  its `RecoveryHint` flows into the envelope; resolver returning a bare string is
  wrapped to `{ hint }`; `errorCodeForError` is exported and classifies correctly.
  (Existing string/`RecoveryHint`/registry-default tests must still pass —
  confirms backward compatibility of `errorResult`.)
- **Edit** `mcp/tests/server.test.ts`: end-to-end — a `clockify_status` call whose
  client throws `401` returns `isError`, code `auth_or_permission`, and a hint
  containing "Profile".
- Structural pattern to copy: `mcp/tests/error-codes.test.ts` (one assertion per
  branch) and `mcp/tests/result.test.ts` (envelope parsing).
- Verification: `npm test -w @apet97/clockify-mcp-115` → all pass, including the
  new `diagnose.test.ts` cases and the added `result`/`server` cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run type-check -w @apet97/clockify-mcp-115` exits 0.
- [ ] `npm test -w @apet97/clockify-mcp-115` exits 0; `mcp/tests/diagnose.test.ts`
      exists and passes; the new `result`/`server` cases pass.
- [ ] `npm run lint -w @apet97/clockify-mcp-115` exits 0.
- [ ] `npm run build -w @apet97/clockify-mcp-115` exits 0.
- [ ] `grep -n "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID" mcp/src/tools/status.ts`
      returns no matches (static hint removed).
- [ ] `grep -rn "RecoveryResolver" mcp/src/result.ts mcp/src/tools/status.ts`
      shows the type defined in `result.ts` and `failureHint` wired in `status.ts`
      (the resolver flows through `defineTool`).
- [ ] `make changelog-drift` exits 0.
- [ ] `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` exits 0
      (solo; re-run if only the startup-time budget flaked).
- [ ] No files outside the in-scope list are modified (`git status`). In
      particular `docs/mcp-tools.json`, `mcp/README.md`, `docs/error-codes.json`,
      and `mcp/src/error-codes.ts` are unchanged.
- [ ] `plans/README.md` status row for 008 updated (unless the reviewer maintains
      the index).

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `7c3a84c`)
  — especially if `errorResult` no longer does the
  `classifyClockifyError → errorCodeForStatus → errorCodeForMessage` derivation,
  or `defineTool`'s `recovery` is already a function/has a different shape.
- A verification fails twice after a reasonable fix attempt.
- You find you need a **new** `ClockifyErrorCode` to express a hint. This plan is
  strictly mapping EXISTING codes to richer text. New codes mean editing the
  generated registry (`docs/error-codes.json` + `make error-docs`) and a separate
  review — out of scope here.
- The fix appears to require touching any out-of-scope file (other tools, README
  tables, tool-count surfaces, the SDK).
- `make perfect-fast` reds on a gate OTHER than the load-sensitive
  `performance-budgets` startup-time check (e.g. coverage floor, mutation, lint,
  type-check) — capture the failing gate and report.
- The assumption "no gate binds a tool's recovery text to the registry" turns out
  false (some new gate diff'ing `diagnose.ts` hints against `docs/error-codes.json`).

## Maintenance notes

For the human/agent who owns this after the change lands:

- **The mapping is shared on purpose.** A future doctor tool (planned elsewhere)
  should reuse `failureHint(err)` directly, or pass it as the `recovery` resolver
  to its own `defineTool` registration — do not re-implement per-class hints.
- **Retrofitting other tools is a follow-up, not this plan.** Any read/write tool
  can opt into class-aware hints by passing `failureHint` (or a custom
  `RecoveryResolver`) as `defineTool`'s 5th arg. Doing it broadly should be its
  own change so the diff stays reviewable; the current default (registry
  `recoveryForCode`) remains correct for tools that don't opt in.
- **Single source of truth for classification.** `errorCodeForError` (in
  `result.ts`) is now the only place the `classify → status → message` precedence
  lives; `errorResult` and `diagnose.failureCode` both go through it. If the
  precedence ever changes, change it there only.
- **Reviewer focus**: (1) the `typeof recovery === "function"` branch in
  `errorResult` (Stryker-mutated — confirm the new `result.test.ts` cases kill
  the mutants); (2) that the happy path of `clockify_status` is byte-identical
  (only the failure hint changed); (3) hint text stays accurate to the live
  remediation (API key is regenerated at Clockify > Profile Settings > API;
  workspace id is 24 hex chars).
- **Deferred**: enriching the rate-limit hint with the parsed `retryAfterMs` from
  the SDK `RateLimitError` (would require threading the raw error's headers into
  `failureHint` and is `rate_limited_retry_after`-specific). Left out to keep the
  mapping pure and header-free.
```
