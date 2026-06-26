# Plan 009: First-run onboarding — server instructions, a getting-started prompt, and a status recovery nudge

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 7c3a84c..HEAD -- mcp/src/server.ts mcp/src/prompts.ts mcp/src/tools/status.ts mcp/tests/server.test.ts mcp/tests/prompt-handler.test.ts mcp/README.md docs/mcp-contract.json docs/mcp-agent-ux-contract.json mcp/CHANGELOG.md`
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

The MCP server has rich orientation tooling (guide resources, a `clockify_tools_guide`
tool, a `clockify-workflow-plan` prompt, a no-network `clockify://mcp/doctor`
resource), but it is entirely **pull-based and agent-facing**: a first-time human user
who connects the server in Claude Desktop / an IDE gets no push to "call
`clockify_status` first" and has no obvious entry point that walks them from
"I pasted an API key" to "I logged my first entry". The single existing prompt
(`clockify-workflow-plan`) assumes the user already knows the workflow vocabulary.

This plan adds three small, low-risk first-run nudges:
(a) extend the server's top-level `instructions` string (surfaced to every MCP client
in `initialize`) to point first-timers at `clockify_status` and the
`clockify://guide/which-tool` resource;
(b) add a discoverable, zero-argument `clockify-getting-started` prompt that walks a
brand-new user from `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID` to their first
`clockify_log_work`;
(c) point `clockify_status`'s **recovery hint** (the message shown when credentials are
missing/invalid) at the new prompt, so the one place a first-timer hits friction tells
them where to start.

What improves: a new user who has never read the docs is guided from connection to first
logged entry without leaving the MCP surface.

## Current state

The facts you need, inlined. **Do not assume anything beyond these excerpts.**

### Tool/prompt counts and how they are (not) gated

- The MCP server advertises **134 tools** (21 workflow + 113 domain). This plan does
  **NOT** change the tool count. Adding a *prompt* is a different surface.
- **No gate counts prompts numerically.** Verified at commit `7c3a84c`:
  `grep -rniE "[0-9]+ prompt" docs/ scripts/ README.md AGENTS.md CLAUDE.md mcp/README.md`
  returns nothing, and `docs/product-surface.*`, `docs/performance-budgets.json`,
  `scripts/check-performance-budgets.mjs`, and `docs/mcp-tool-manifest.json` contain no
  `prompt` references at all. The only prompt-count surface is **derived**: the prompt
  *names* live as an array in `docs/mcp-contract.json` → `expected.prompts`, and
  `scripts/check-mcp-contract.mjs` prints `${contract.expected.prompts.length} prompts`
  computed from that array (line 225). There is no hardcoded "1 prompt" string to bump.
- Therefore the prompt cascade is **bounded**: registering the prompt, listing its name
  in `docs/mcp-contract.json`, and referencing the name in the server test and the MCP
  README (because `check-mcp-contract.mjs` asserts each `expected.prompts` entry appears
  in all three — see below).

### `mcp/src/server.ts` — the server `instructions` field

The `instructions` option is **already** wired (`buildServer` passes
`instructions: SERVER_INSTRUCTIONS`). You only extend the string. Current excerpt
(`mcp/src/server.ts:35-44`):

```ts
// SERVER_INSTRUCTIONS is the MCP serverInstructions string. Receipts return structuredContent envelopes per the MCP output schema contract.
export const SERVER_INSTRUCTIONS =
    "This is a single-user Clockify MCP for one pinned workspace. " +
    "All tools operate on the workspace set by CLOCKIFY_WORKSPACE_ID. " +
    "Use clockify_status first to confirm credentials, workspace, and running timer state. " +
    "Prefer workflow tools before low-level domain tools. " +
    "Use IDs returned by previous structured receipts rather than re-resolving names. " +
    "For invoices, expenses, time off, scheduling, and webhooks, run dry_run first and reuse the returned confirm_token. " +
    "Inspect ids, changed, warnings, next, stable error codes, and recovery hints. " +
    "If a feature is unavailable on the workspace plan, report the recovery hint and continue.";
```

**Constraint — preserve all 7 agent-UX markers.** `docs/mcp-agent-ux-contract.json` →
check `server-instructions` (path `mcp/src/server.ts`) asserts these literal substrings
are present *somewhere in the whole `server.ts` file*: `"Use clockify_status first"`,
`"Prefer workflow tools before low-level domain tools"`, `"structured receipts"`,
`"dry_run"`, `"confirm_token"`, `"stable error codes"`, `"recovery"`. All 7 are present
today (verified). Your edit must not remove any of them.

### `mcp/src/prompts.ts` — existing prompt registration pattern (the exemplar to copy)

Full current file (`mcp/src/prompts.ts:1-37`):

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerClockifyPrompts(server: McpServer): void {
    server.registerPrompt(
        "clockify-workflow-plan",
        {
            title: "Clockify Workflow Plan",
            description: "Plan a safe Clockify workflow using status, workflow tools, receipts, and recovery hints.",
            argsSchema: {
                goal: z.string().optional(),
            },
        },
        ({ goal }) => {
            const normalizedGoal = goal?.trim() || "not specified";

            return {
                messages: [
                    {
                        role: "user" as const,
                        content: {
                            type: "text" as const,
                            text:
                                "Plan a safe Clockify MCP workflow for the user goal below.\n\n" +
                                `Goal: ${normalizedGoal}\n\n` +
                                "Return a numbered plan. Start with clockify_status. Prefer workflow tools " +
                                "before domain tools. Use IDs from receipts instead of re-resolving names. " +
                                "For invoices, expenses, time off, scheduling, and webhooks, include a dry_run " +
                                "preview step before any confirmed write. Include the expected receipt fields " +
                                "and the recovery code to report if the call fails.",
                        },
                    },
                ],
            };
        },
    );
}
```

> **Naming decision (made for you — do not deviate):** the new prompt is named
> **`clockify-getting-started`** (hyphenated), to match the existing prompt
> `clockify-workflow-plan`. Prompts in this repo use hyphens; **tools** use underscores
> (`clockify_status`). The task brief that motivated this plan wrote the name with
> underscores ("clockify_getting_started") — that was prose shorthand. Use the
> hyphenated form everywhere so it sits beside `clockify-workflow-plan`.

### `mcp/src/tools/status.ts` — the recovery hint to nudge

Full current file (`mcp/src/tools/status.ts:1-53`). The recovery hint is the **5th
argument** to `defineTool`, line 51:

```ts
        "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid.",
```

`successResult`'s `next:[...]` (lines 38-47) lists `{tool, reason}` actions on the
**success** path; `NextAction.tool` (see `mcp/src/result.ts:88-92`) is typed as a
required **tool name**, and a prompt is not a tool. The server also cannot run
"unconfigured": `mcp/src/client.ts:73-83` (`loadContext`) throws if `CLOCKIFY_API_KEY`
or `CLOCKIFY_WORKSPACE_ID` is missing, and `mcp/src/index.ts`'s `main()` writes
`fatal:` to stderr and `process.exit(1)` — so the process never reaches tool dispatch
when env is absent. The realistic "first-timer friction" surface for `clockify_status`
is therefore its **error path** (present-but-invalid key → 401 → `errorResult` with the
recovery hint). That is why part (c) edits the **recovery hint string**, not `next[]`.
Do **not** put a prompt name into `next[].tool`.

### How `scripts/check-mcp-contract.mjs` validates prompts (the gate you must satisfy)

`docs/mcp-contract.json` currently has (`docs/mcp-contract.json:17-19`):

```json
    "prompts": [
      "clockify-workflow-plan"
    ],
```

`scripts/check-mcp-contract.mjs:178-182` iterates `contract.expected.prompts` and, for
**each** prompt name, fails unless the name appears in:
- the prompts source (`mcp/src/prompts.ts`),
- the server test (`mcp/tests/server.test.ts`),
- the README (`mcp/README.md`).

So adding `clockify-getting-started` to `expected.prompts` *requires* the same name to
appear in those three files. (`assertStringArray(..., {allowEmpty:false})` + `assertUnique`
also run, so keep entries unique and non-empty.)

### `mcp/tests/server.test.ts` — the prompt-list assertion (line 332)

```ts
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-workflow-plan");
```

This is a `toContain` (not an exhaustive equality), so it tolerates extra prompts; you
will **add** a second `toContain` for the new prompt (needed so the contract's
"server test missing <prompt>" check passes). The tool-count assertion
`expect(names).toHaveLength(134);` (line 243) must stay **134** — do not touch it.

### `mcp/tests/prompt-handler.test.ts` — end-to-end prompt-handler test pattern

This file (`mcp/tests/prompt-handler.test.ts:1-103`) stands up a bare `McpServer` with
only `registerClockifyPrompts`, connects an in-memory client, and drives
`listPrompts`/`getPrompt` so the handler body actually runs (coverage). You will add a
new `describe` block here for `clockify-getting-started` so its handler body is executed
(coverage gates count executed lines; an unexercised new handler can drop the mcp
coverage floor).

### `mcp/README.md` — the hand-written Prompts list (line 224-226)

```md
Prompts:

- `clockify-workflow-plan` — interactive workflow plan for time tracking and admin flows.
```

This list is **outside** the auto-generated table blocks. The only generated blocks in
`mcp/README.md` are `<!-- BEGIN generated:mcp-workflow-tools -->`…`END` (lines 51-75)
and `<!-- BEGIN generated:mcp-domain-tools -->`…`END` (lines 242-264). The Prompts list
at line 224-226 sits between them in hand-written prose, so edit it directly;
`make readme-tables` will not touch or revert it.

### `mcp/CHANGELOG.md` — required by the changelog-drift gate

`make changelog-drift` fails if you touch the mcp package without adding a
`mcp/CHANGELOG.md` entry. The file has a top `## [Unreleased]` section with
`### Fixed` / `### Changed` / `### Security` subsections (`mcp/CHANGELOG.md:5-30`). You
will add an `### Added` entry under `## [Unreleased]`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Root install (once, fresh clone) | `npm ci` | exit 0 |
| Generate SDK source (fresh clone only) | `make sdk-codegen` | exit 0; populates `wrapper/src/**`, `output/ts-sdk/**` |
| Build wrapper (provides MCP's types via `wrapper/dist`) | `npm run build -w clockify-sdk-ts-115` | exit 0 |
| MCP type-check | `npm run type-check -w @clockify115/mcp-server` | exit 0, no errors |
| MCP tests | `npm test -w @clockify115/mcp-server` | all pass (existing + new) |
| MCP build | `npm run build -w @clockify115/mcp-server` | exit 0 |
| MCP lint | `npm run lint -w @clockify115/mcp-server` | exit 0 |
| MCP discoverability contract | `make mcp-contract` | exit 0; prints `... 6 resources, 2 prompts` |
| MCP agent-UX contract | `make mcp-agent-ux` | exit 0 |
| Changelog drift | `make changelog-drift` | exit 0 |
| README tables drift | `make readme-tables-drift` | exit 0 (no diff in tool tables) |
| Final proof (run SOLO, see caveat) | `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` | exit 0 |

Notes verified at `7c3a84c`:
- `make perfect-fast` **already includes** `mcp-contract`, `mcp-agent-ux`,
  `mcp-write-safety`, `changelog-drift`, `readme-tables-drift`, `mcp-gates`, and `lint`
  (the same Makefile line), so it is the correct final gate for this plan.
- **Blank the creds** as shown — with creds set, the live `sandbox.test.ts` suites run
  and fail 401 on the expired sandbox key; blanked, they self-skip and the run is
  deterministic.
- **Run `perfect-fast` SOLO.** Its `performance-budgets` sub-gate measures CLI/MCP
  startup time and flakes red under concurrent CPU load (false reds). Do not run other
  heavy commands during it. A red there with everything else green is the known flake —
  re-run solo. This plan changes no file-size or startup budget.
- `perfect-full` is **not required** for this plan: no count/parity/product-surface
  surface moves. Run it only if you want extra assurance.

## Suggested executor toolkit

- Use the `LSP` tool (`goToDefinition`, `hover`) on `registerPrompt`,
  `successResult`, and `defineTool` if you want type confirmation; otherwise the
  excerpts above are sufficient.

## Scope

**In scope** (the only files you may modify):
- `mcp/src/server.ts` — extend `SERVER_INSTRUCTIONS` (Step 1)
- `mcp/src/prompts.ts` — register `clockify-getting-started` (Step 2)
- `mcp/src/tools/status.ts` — extend the recovery hint (Step 3)
- `docs/mcp-contract.json` — add the prompt name to `expected.prompts` (Step 4)
- `mcp/tests/server.test.ts` — add a `toContain` for the new prompt (Step 4)
- `mcp/README.md` — add the new prompt to the hand-written Prompts list (Step 4)
- `mcp/tests/prompt-handler.test.ts` — add an end-to-end test for the new prompt (Step 5)
- `mcp/CHANGELOG.md` — add an `### Added` Unreleased entry (Step 6)
- `docs/mcp-agent-ux-contract.json` — OPTIONAL marker hardening (Step 7; clearly optional)
- `plans/README.md` — update this plan's status row when done

**Out of scope** (do NOT touch):
- `docs/mcp-tools.json`, `docs/mcp-tool-manifest.json`, `docs/product-surface.*`,
  `docs/performance-budgets.json`, `docs/docs-counts-contract.json`,
  `docs/operation-parity.*` — these track the **tool** surface, which is unchanged
  (still 134). No edit needed and editing them is wrong.
- The `<!-- BEGIN generated:* -->` blocks in `mcp/README.md` — generated; do not edit.
- `mcp/src/tools/status.ts` success-path `next:[...]` — do not add a prompt to
  `next[].tool` (prompts are not tools; see Current state).
- `wrapper/src/**`, `output/ts-sdk/**`, `spec/corrected/**` — generated / hard-stop.
- `package.json` versions, release config, CI — hard-stop.

## Git workflow

- Branch: `advisor/009-first-run-onboarding-nudge` (do not work on `main`).
- Commit per logical step or as one commit; repo uses Conventional Commits
  (recent log example: `fix(spec,cli,mcp): SharedReport isPublic/link ...`). A fitting
  message: `feat(mcp): first-run onboarding (server instructions + clockify-getting-started prompt + status recovery nudge)`.
- End the commit message body with the `Claude-Session:` trailer required by repo
  convention.
- Do NOT push or open a PR unless the operator explicitly asks. Do NOT `npm publish`.

## Steps

### Step 1: Extend `SERVER_INSTRUCTIONS` to nudge first-timers

In `mcp/src/server.ts`, add **one** sentence to the `SERVER_INSTRUCTIONS` string,
immediately after the existing
`"Use clockify_status first to confirm credentials, workspace, and running timer state. "`
line. Keep every existing line (all 7 agent-UX markers must remain). Insert:

```ts
    "On first run, get the clockify-getting-started prompt and read the clockify://guide/which-tool resource. " +
```

(Place it as its own `+`-joined string literal between the `clockify_status first` line
and the `Prefer workflow tools ...` line. The trailing space inside the literal matters —
the string is concatenated without separators.)

**Verify**:
- `npm run type-check -w @clockify115/mcp-server` → exit 0.
- All 7 markers still present:
  `for m in "Use clockify_status first" "Prefer workflow tools before low-level domain tools" "structured receipts" "dry_run" "confirm_token" "stable error codes" "recovery"; do grep -qF "$m" mcp/src/server.ts && echo "ok: $m" || echo "MISSING: $m"; done`
  → seven `ok:` lines, zero `MISSING:`.

### Step 2: Register the `clockify-getting-started` prompt

In `mcp/src/prompts.ts`, inside `registerClockifyPrompts`, **after** the existing
`server.registerPrompt("clockify-workflow-plan", …)` call, add a second registration.
Model it on the exemplar. Use **no arguments** (a zero-arg prompt keeps it discoverable
and the test trivial). Target shape:

```ts
    server.registerPrompt(
        "clockify-getting-started",
        {
            title: "Clockify: Getting Started",
            description:
                "First-run setup walkthrough: from API key + workspace to your first logged time entry.",
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text:
                            "Walk me through setting up this Clockify MCP server for the first time. " +
                            "Return a short numbered checklist:\n\n" +
                            "1. Confirm CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set in the MCP " +
                            "client's env block for @clockify115/mcp-server.\n" +
                            "2. Call clockify_status to confirm credentials, the pinned workspace, the " +
                            "current user, and any running timer.\n" +
                            "3. Read the clockify://guide/which-tool resource to map intent to the first tool.\n" +
                            "4. Use clockify_create_work_package to create or reuse a project, task, or tag.\n" +
                            "5. Log the first entry with clockify_log_work (finished work) or start a live " +
                            "timer with clockify_start_work.\n" +
                            "6. For invoices, expenses, time off, scheduling, or webhooks, preview with " +
                            "dry_run and reuse the returned confirm_token.\n\n" +
                            "If clockify_status fails, report the stable error code and recovery hint instead " +
                            "of retrying blindly.",
                    },
                },
            ],
        }),
    );
```

Notes:
- Omit `argsSchema` entirely (this makes it a zero-argument prompt; `getPrompt` is
  called with no `arguments`). The `z` import already exists and stays used by the first
  prompt — do not remove it.
- The body deliberately contains `clockify_status`, `CLOCKIFY_API_KEY`,
  `CLOCKIFY_WORKSPACE_ID`, `clockify://guide/which-tool`, `clockify_log_work`,
  `dry_run`, and `confirm_token` — these are asserted by the Step 5 test (and enable the
  optional Step 7 markers).

**Verify**: `npm run type-check -w @clockify115/mcp-server` → exit 0.

### Step 3: Point `clockify_status`'s recovery hint at the new prompt

In `mcp/src/tools/status.ts`, change the recovery-hint string (line 51) from:

```ts
        "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid.",
```

to:

```ts
        "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid. For first-time setup, get the clockify-getting-started prompt.",
```

Do **not** modify the success-path `next:[...]` array. Do **not** add a prompt to
`next[].tool`.

**Verify**: `npm run type-check -w @clockify115/mcp-server` → exit 0.

### Step 4: Register the prompt across the discoverability contract (3 files + 1 contract entry)

These four edits must land together — `make mcp-contract` fails unless all are present.

1. `docs/mcp-contract.json` — change `expected.prompts` to:

```json
    "prompts": [
      "clockify-workflow-plan",
      "clockify-getting-started"
    ],
```

2. `mcp/tests/server.test.ts` — in the test
   `it("advertises guide resources and workflow prompt", …)`, after the existing line
   (~332):

```ts
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-workflow-plan");
```

   add:

```ts
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-getting-started");
```

   Leave `expect(names).toHaveLength(134);` (line ~243) unchanged.

3. `mcp/README.md` — in the hand-written Prompts list (line ~224-226), add a second
   bullet:

```md
- `clockify-getting-started` — first-run setup walkthrough from API key and workspace to your first logged entry.
```

**Verify**:
- `make mcp-contract` → exit 0, output ends `MCP contract passed (134 tools, 6 resources, 2 prompts)`.
- `npm test -w @clockify115/mcp-server` → all pass (the server-test prompt assertion now
  checks both names).

### Step 5: Add an end-to-end test for the new prompt handler (coverage)

In `mcp/tests/prompt-handler.test.ts`, add a new `describe` block (after the existing
`describe("clockify-workflow-plan prompt", …)`). Reuse the file's existing `connect()`
and `promptText()` helpers — they already register all prompts via
`registerClockifyPrompts`. Target:

```ts
describe("clockify-getting-started prompt", () => {
    it("advertises the prompt with a title and description", async () => {
        const client = await connect();
        const { prompts } = await client.listPrompts();
        const intro = prompts.find((p) => p.name === "clockify-getting-started");
        expect(intro).toBeDefined();
        expect(intro?.title).toBe("Clockify: Getting Started");
        expect(intro?.description).toMatch(/first-run setup walkthrough/i);
    });

    it("renders the first-run checklist when invoked with no arguments", async () => {
        const client = await connect();
        const result = await client.getPrompt({ name: "clockify-getting-started" });
        const text = promptText(result.messages);
        expect(text).toContain("clockify_status");
        expect(text).toContain("CLOCKIFY_API_KEY");
        expect(text).toContain("clockify://guide/which-tool");
        expect(text).toContain("clockify_log_work");
        expect(text).toContain("dry_run");
    });
});
```

> Note: this prompt takes no arguments, so `getPrompt` is called without an `arguments`
> field. If the MCP client rejects a missing `arguments` for a no-arg prompt at runtime,
> that is a STOP condition (see STOP conditions) — pass `arguments: {}` and re-run; if it
> still fails, stop and report.

**Verify**: `npm test -w @clockify115/mcp-server` → all pass, including the two new
`clockify-getting-started` tests.

### Step 6: Add the changelog entry

In `mcp/CHANGELOG.md`, under `## [Unreleased]`, add an `### Added` subsection (place it
above `### Fixed`):

```md
### Added

- First-run onboarding: the server `instructions` now point new users at
  `clockify_status` and `clockify://guide/which-tool`; a new zero-argument
  `clockify-getting-started` prompt walks a brand-new user from API key + workspace to
  their first logged entry; and `clockify_status`'s recovery hint now points at that
  prompt when credentials are missing or invalid. No tool was added or removed
  (still 134 tools).
```

**Verify**: `make changelog-drift` → exit 0.

### Step 7 (OPTIONAL — recommended hardening): lock the new prompt's content in the agent-UX contract

This step is **optional**. `make mcp-agent-ux` already passes with the existing markers;
this only pins the new prompt's content so future edits can't silently gut it. If you do
it, in `docs/mcp-agent-ux-contract.json`, find the check with `"id": "prompt"`
(path `mcp/src/prompts.ts`, markers array) and append these two markers (every marker
must appear literally in `mcp/src/prompts.ts`, which Step 2 guarantees):

```json
        "clockify-getting-started",
        "Clockify: Getting Started"
```

(Keep the array unique — `check-mcp-agent-ux.mjs` runs `assertUnique` on markers.)

**Verify**: `make mcp-agent-ux` → exit 0.

### Step 8: Full focused verification

Run, and confirm each:
- `npm run type-check -w @clockify115/mcp-server` → exit 0
- `npm run build -w @clockify115/mcp-server` → exit 0
- `npm test -w @clockify115/mcp-server` → all pass
- `npm run lint -w @clockify115/mcp-server` → exit 0
- `make mcp-contract` → exit 0 (`… 6 resources, 2 prompts`)
- `make mcp-agent-ux` → exit 0
- `make changelog-drift` → exit 0
- `make readme-tables-drift` → exit 0

Then the **final proof, SOLO** (no other heavy processes running):
`CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` → exit 0. If only
`performance-budgets` reds while everything else is green, that is the known
load-sensitive flake — re-run solo to confirm green.

## Test plan

- **New tests** (`mcp/tests/prompt-handler.test.ts`): a `describe("clockify-getting-started prompt")`
  block with (1) a discovery test asserting `listPrompts` includes the prompt with the
  expected title/description, and (2) a render test asserting the handler body (invoked
  with no arguments) contains `clockify_status`, `CLOCKIFY_API_KEY`,
  `clockify://guide/which-tool`, `clockify_log_work`, and `dry_run`. Model: the existing
  `describe("clockify-workflow-plan prompt")` block in the same file.
- **Amended test** (`mcp/tests/server.test.ts`): the
  `"advertises guide resources and workflow prompt"` test gains a second `toContain`
  for `clockify-getting-started`; the `toHaveLength(134)` tool assertion is unchanged
  (regression guard that the tool count did not move).
- **Verification**: `npm test -w @clockify115/mcp-server` → all pass, including the new
  prompt tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run type-check -w @clockify115/mcp-server` exits 0
- [ ] `npm run build -w @clockify115/mcp-server` exits 0
- [ ] `npm test -w @clockify115/mcp-server` exits 0; the two new
      `clockify-getting-started` tests in `mcp/tests/prompt-handler.test.ts` exist and pass
- [ ] `npm run lint -w @clockify115/mcp-server` exits 0
- [ ] `make mcp-contract` exits 0 and prints `MCP contract passed (134 tools, 6 resources, 2 prompts)`
- [ ] `make mcp-agent-ux` exits 0
- [ ] `make changelog-drift` exits 0
- [ ] `make readme-tables-drift` exits 0
- [ ] `grep -c "clockify-getting-started" mcp/src/prompts.ts mcp/tests/server.test.ts mcp/README.md docs/mcp-contract.json` shows a non-zero count for each file
- [ ] Tool count unchanged: `grep -n "toHaveLength(134)" mcp/tests/server.test.ts` still matches, and `make mcp-contract` reports 134 tools
- [ ] All 7 server-instructions markers still present in `mcp/src/server.ts` (the `for` loop in Step 1 prints seven `ok:` lines)
- [ ] `clockify_status`'s recovery hint in `mcp/src/tools/status.ts` mentions `clockify-getting-started`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` exits 0 (run solo)
- [ ] `plans/README.md` status row for plan 009 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `7c3a84c` and the "Current
  state" excerpts no longer match the live code (e.g. `SERVER_INSTRUCTIONS` was
  restructured, `docs/mcp-contract.json` already lists a second prompt, or
  `status.ts`'s recovery hint differs from the quoted line).
- `make mcp-contract` fails with "prompts source missing", "server test missing", or
  "README missing" for `clockify-getting-started` after Step 4 — it means one of the
  three required references is absent or misspelled; fix the spelling (exact hyphenated
  `clockify-getting-started`) and re-run. If it still fails after one fix, stop.
- The MCP client errors on `getPrompt` for a no-argument prompt even after retrying with
  `arguments: {}` (Step 5) — the SDK version may require an args schema; stop and report
  rather than inventing an arg.
- A grep reveals a hardcoded prompt count somewhere (e.g. a literal "1 prompt") that you
  would have to bump — none exists at `7c3a84c`; if one appears, the tree drifted, stop
  and report.
- `make perfect-fast` fails on any gate **other than** a solo-reproducible
  `performance-budgets` startup-time flake.
- Any fix appears to require editing an out-of-scope file (especially
  `docs/mcp-tools.json` or `docs/performance-budgets.json` — if those need changing, your
  edit accidentally moved the tool count; revert and re-check).

## Maintenance notes

For the human/agent who owns this after the change lands:

- **The prompt cascade is the contract triad.** Any future prompt must be added to
  `docs/mcp-contract.json` → `expected.prompts` **and** referenced by name in both
  `mcp/tests/server.test.ts` and `mcp/README.md` (the Prompts list), or `make
  mcp-contract` fails. `check-mcp-contract.mjs` derives the printed prompt count from the
  array length — there is no number to hand-bump.
- **Prompts are not counted by any tool-count gate** (no entry in `docs/mcp-tools.json`,
  `docs/mcp-tool-manifest.json`, `docs/product-surface.*`, or
  `docs/performance-budgets.json`). This is why this change is LOW-cascade despite adding
  a surface. If a future maintainer wants prompts to appear in `product-surface`, that is
  a new, larger piece of work.
- **Server instructions are gated by substring markers**, not by exact text — see
  `docs/mcp-agent-ux-contract.json` check `server-instructions`. Rewordings are fine as
  long as the 7 markers survive.
- **A reviewer should scrutinize**: (1) that the tool count assertion stayed 134; (2)
  that no prompt name leaked into `clockify_status`'s `next[].tool` (it must stay in the
  recovery hint string); (3) that the `mcp/README.md` edit is in the hand-written Prompts
  list, not inside a `<!-- BEGIN generated:* -->` block.
- **Deferred out of scope (intentional)**: surfacing the getting-started prompt in
  `docs/product-surface.*`, adding a CLI `clk115 getting-started` mirror, and any
  npm/GitHub-Release distribution — all maintainer calls and/or larger surfaces.
