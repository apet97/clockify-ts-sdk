# Plan 004: Extend Dependabot to monitor the cli and mcp packages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9839a72..HEAD -- .github/dependabot.yml`
> If it changed since this plan was written, compare the "Current state" excerpt
> against the live file before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `9839a72`, 2026-06-16

## Why this matters

Dependabot's npm scanner only watches `/wrapper`. The `cli` and `mcp` packages —
which, unlike the dependency-free SDK, ship **runtime** dependencies
(`commander`, `picocolors`, `cli-table3` in cli; `@modelcontextprotocol/sdk`,
`zod` in mcp) plus their own dev-deps (`typescript`, `eslint`, `vitest`) — are
unmonitored. Security fixes and version drift in two of the three publishable
packages will not surface as PRs. This adds the two missing npm update blocks so
all three workspaces are covered on the same weekly cadence.

## Current state

- `.github/dependabot.yml` — full file today:

  ```yaml
  version: 2

  # Dependabot keeps the wrapper's npm devDependencies and the
  # repo's GitHub Actions versions current. Weekly cadence ...
  # ... the wrapper/package.json devDeps are the only npm surface dependabot needs to watch.

  updates:
    - package-ecosystem: "npm"
      directory: "/wrapper"
      schedule:
        interval: "weekly"
        day: "monday"
        time: "06:00"
        timezone: "Europe/Belgrade"
      open-pull-requests-limit: 5
      commit-message:
        prefix: "chore(deps)"
        prefix-development: "chore(dev-deps)"
      labels:
        - "dependencies"
        - "npm"

    - package-ecosystem: "github-actions"
      directory: "/"
      schedule: { interval: weekly, day: monday, time: "06:00", timezone: Europe/Belgrade }
      open-pull-requests-limit: 3
      commit-message:
        prefix: "chore(ci)"
      labels: [ "dependencies", "github-actions" ]
  ```

- `cli/package.json` has runtime `dependencies` (commander, picocolors, cli-table3) and dev-deps (typescript, eslint, vitest). `mcp/package.json` has runtime `dependencies` (@modelcontextprotocol/sdk, zod) and dev-deps.
- The repo's commit-message convention: `chore(deps)` for runtime, `chore(dev-deps)` for dev (the wrapper block uses `prefix` + `prefix-development`). Recent git log confirms `chore(dev-deps)` and `chore(ci)` prefixes are in use.
- **No make gate or CI step validates `.github/dependabot.yml`** — it is consumed only by GitHub. So verification here is YAML validity + presence of the new entries, not a `make` target.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Validate YAML | `node -e "const y=require('yaml');y.parse(require('fs').readFileSync('.github/dependabot.yml','utf8'));console.log('ok')"` | prints `ok` (the `yaml` package is a root devDependency) |
| Confirm directories | `grep -E 'directory:' .github/dependabot.yml` | shows `/wrapper`, `/cli`, `/mcp`, `/` |

## Scope

**In scope**:
- `.github/dependabot.yml` only.

**Out of scope**:
- The `github-actions` block (already repo-wide via `/`).
- Any `package.json` — do not change dependency versions; this plan only adds monitoring.
- Any code, doc, or gate.

## Git workflow

- Branch: `advisor/004-dependabot-cover-cli-mcp`
- Commit message: `chore(ci): monitor cli and mcp npm dependencies with dependabot`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `/cli` and `/mcp` npm update blocks

In `.github/dependabot.yml`, under `updates:`, add two new `package-ecosystem: "npm"` blocks — one with `directory: "/cli"` and one with `directory: "/mcp"` — each a copy of the existing `/wrapper` block (same `schedule`, `open-pull-requests-limit: 5`, `commit-message` prefixes, and `labels`). Place them immediately after the `/wrapper` block and before the `github-actions` block.

Also update the comment at the top (lines ~3–10): it currently says the wrapper devDeps are "the only npm surface dependabot needs to watch" — change it to reflect that all three workspaces (`/wrapper`, `/cli`, `/mcp`) are now monitored, and that cli/mcp additionally carry runtime dependencies.

**Verify**: `node -e "const y=require('yaml');y.parse(require('fs').readFileSync('.github/dependabot.yml','utf8'));console.log('ok')"` → `ok`.

### Step 2: Confirm the directories are present

**Verify**: `grep -E 'directory:' .github/dependabot.yml` → lists `/wrapper`, `/cli`, `/mcp`, and `/` (four entries).

## Test plan

- No automated test (GitHub consumes this file). The verification is YAML validity
  + the four `directory:` entries. After merge, GitHub's Dependabot UI
  ("Insights → Dependency graph → Dependabot") will show the three npm manifests
  being tracked — note this for the reviewer to confirm post-merge.

## Done criteria

ALL must hold:
- [ ] `.github/dependabot.yml` parses as valid YAML.
- [ ] It contains three npm `directory:` entries: `/wrapper`, `/cli`, `/mcp` (plus the `/` github-actions one).
- [ ] The cli/mcp blocks mirror the wrapper block's schedule, limit, commit-message prefixes, and labels.
- [ ] The top comment no longer claims wrapper is the only npm surface.
- [ ] No files outside `.github/dependabot.yml` are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The current `.github/dependabot.yml` doesn't match the "Current state" excerpt (drift).
- The `yaml` package isn't available for the validation command — use `python3 -c "import yaml,sys;yaml.safe_load(open('.github/dependabot.yml'))"` instead, or report that neither validator is available.

## Maintenance notes

- After merge, expect an initial burst of Dependabot PRs for cli/mcp (their deps
  were never bumped via Dependabot before). Triage them like the wrapper's.
- If a fourth workspace is ever added, add a matching npm block here.
- Reviewer should confirm the commit-message prefixes match the repo convention so
  the changelog/CI tooling keeps classifying dependency PRs correctly.
