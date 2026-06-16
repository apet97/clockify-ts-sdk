# Plan 003: Make `clk115 start --task` fail clearly when `--project` is missing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9839a72..HEAD -- cli/src/commands/start.ts cli/tests/start.test.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `9839a72`, 2026-06-16

## Why this matters

`clk115 start "work" --task "MyTask"` (without `--project`) **silently drops the
task**: the timer starts with no task attached and no error or warning. A Clockify
task only exists within a project, so the CLI can't resolve a task name without a
project — but instead of saying so, it ignores the flag. The result is silent data
loss (the user believes the entry is tagged to a task that isn't there). The fix is
a one-line guard that turns the silent drop into a clear error, matching how the
command already errors on unresolved names.

## Current state

- `cli/src/commands/start.ts` — the `start` command. The relevant lines (39–43):

  ```ts
  const projectId = opts.project ? await resolveProjectId(client, workspaceId, opts.project) : undefined;
  const taskId =
      opts.task && projectId
          ? await resolveTaskId(client, workspaceId, projectId, opts.task)
          : undefined;
  ```

  When `opts.task` is set but `projectId` is `undefined`, the ternary yields
  `undefined` and the task is dropped with no signal.

- The command's existing error convention is a thrown `Error` (line 36:
  `throw new Error("could not determine user ID from getCurrentUser response");`,
  and the resolver helpers throw `Error`s like `project ... not found in workspace`).
  Match that — throw a plain `Error`.

- `cli/tests/start.test.ts` — the test file. It builds a program via
  `makeProgram(client)` and runs commands with a `run(client, [...args])` helper
  that calls `parseAsync(["node","clk115","start",...args])`. Errors are asserted
  with `await expect(run(client, [...])).rejects.toThrow(/.../)` — see the existing
  test "throws a clear error when the project name does not resolve"
  (`cli/tests/start.test.ts:99-104`). Model the new test after it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck CLI | `npm run type-check -w @clockify115/cli` | exit 0 |
| CLI tests | `npm test -w @clockify115/cli` | all pass (incl. 1 new) |
| CLI gate | `make cli-contract` | passes |
| Full proof | `make perfect-fast` | exit 0 |

## Scope

**In scope**:
- `cli/src/commands/start.ts` — add the guard.
- `cli/tests/start.test.ts` — add one test.
- `cli/CHANGELOG.md` — add an `## [Unreleased]` entry (touching `cli/` requires it for `make changelog-drift`).

**Out of scope**:
- The resolver helpers (`resolveProjectId`/`resolveTaskId`/`resolveTagIds`) — they are correct.
- Any other command, and the `start` command's success path / receipt shape.

## Git workflow

- Branch: `advisor/003-cli-start-task-requires-project`
- Commit message: `fix(cli): error instead of silently dropping --task when --project is absent`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the guard

In `cli/src/commands/start.ts`, immediately after the `projectId` line (39) and
before the `taskId` line (40), insert:

```ts
if (opts.task && !projectId) {
    throw new Error("--task requires --project: a task can only be resolved within a project.");
}
```

Leave the `taskId` ternary as-is (it remains correct once the guard is in place).

**Verify**: `npm run type-check -w @clockify115/cli` → exit 0.

### Step 2: Add a regression test

In `cli/tests/start.test.ts`, add a test modeled on the "project name does not
resolve" test:

```ts
it("errors when --task is given without --project", async () => {
    const { client } = makeClient({ projects: [], tasks: [] });
    await expect(run(client, ["work", "--task", "MyTask"])).rejects.toThrow(
        /--task requires --project/,
    );
});
```

(Use whatever `makeClient`/`run` signatures the file already defines — match the
neighboring tests exactly.)

**Verify**: `npm test -w @clockify115/cli` → all pass, including the new test.

### Step 3: Changelog

Add an `## [Unreleased]` → `### Fixed` bullet to `cli/CHANGELOG.md`.

**Verify**: `make changelog-drift` → `changelog coverage is current for touched package scopes`.

### Step 4: Full proof

**Verify**: `make perfect-fast` → exit 0.

## Test plan

- New test in `cli/tests/start.test.ts`: invoking `start` with `--task` and no
  `--project` rejects with a message matching `/--task requires --project/`.
- Confirm the existing tests still pass (the guard must not affect the
  project-present paths — `--project X --task Y` still resolves the task).
- Model after `cli/tests/start.test.ts:99-104`.
- Verification: `npm test -w @clockify115/cli` → all pass.

## Done criteria

ALL must hold:
- [ ] `cli/src/commands/start.ts` throws when `opts.task && !projectId`.
- [ ] `npm run type-check -w @clockify115/cli` exits 0.
- [ ] `npm test -w @clockify115/cli` passes with the new test present.
- [ ] `cli/CHANGELOG.md` `## [Unreleased]` updated; `make changelog-drift` passes.
- [ ] `make perfect-fast` exits 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The `start.ts` lines 39–43 don't match the "Current state" excerpt (drift).
- The new test fails after one reasonable fix attempt — report the actual error text vs the expected regex.

## Maintenance notes

- If a future change lets tasks be resolved without a project (e.g. a global task
  lookup), this guard must be revisited.
- Consider applying the same "task requires project" guard to other commands that
  accept `--task` (e.g. `log`, `switch`) — a deliberate follow-up, not in this plan's
  scope; flag it in review if those commands have the same shape.
