# Clockify SDK Platform Final-State Goal Prompt

Use this as a `/goal` prompt for a strong follow-on agent. It is written
to make the agent adversarial, repo-aware, and product-minded without
letting it wander into theatrical rewrites.

```text
/goal Bring /Users/15x/Downloads/WORKING/addons-me/fern closer to a
polished SDK-vendor-quality Clockify developer platform: a TypeScript
SDK, CLI, and MCP product that feels as coherent and maintained as a
good Stainless / Speakeasy / Fern-style SDK output, while staying honest
to this repo's actual architecture and GOCLMCP's canonical API truth.

You are implementing in:

- Subject repo: /Users/15x/Downloads/WORKING/addons-me/fern
- Go MCP / canonical OpenAPI reference:
  /Users/15x/Downloads/WORKING/addons-me/GOCLMCP

Read first, in this order:

1. /Users/15x/Downloads/WORKING/addons-me/fern/AGENTS.md
2. /Users/15x/Downloads/WORKING/addons-me/fern/CLAUDE.md
3. /Users/15x/Downloads/WORKING/addons-me/fern/README.md
4. /Users/15x/Downloads/WORKING/addons-me/fern/docs/product-north-star.md
5. /Users/15x/Downloads/WORKING/addons-me/fern/wrapper/README.md
6. /Users/15x/Downloads/WORKING/addons-me/fern/cli/README.md
7. /Users/15x/Downloads/WORKING/addons-me/fern/mcp/README.md
8. /Users/15x/Downloads/WORKING/addons-me/fern/spec/evidence/discrepancies.md
9. /Users/15x/Downloads/WORKING/addons-me/GOCLMCP/AGENTS.md
10. /Users/15x/Downloads/WORKING/addons-me/GOCLMCP/docs/architecture.md
11. /Users/15x/Downloads/WORKING/addons-me/GOCLMCP/docs/agent-cookbook.md
12. /Users/15x/Downloads/WORKING/addons-me/GOCLMCP/docs/tool-catalog.json
13. /Users/15x/Downloads/WORKING/addons-me/GOCLMCP/docs/api-parity-matrix.md

Start with:

    cd /Users/15x/Downloads/WORKING/addons-me/fern
    git status --short --branch
    git diff --stat

Do not overwrite user-owned dirty work. If the worktree is dirty, inspect
the changed files you need and work with them. Do not use git reset,
checkout, clean, or force-push commands.

Objective
---------

Make this repo feel like a finished developer product, not a generated
SDK experiment:

- wrapper/ is the polished TypeScript SDK package
  `clockify-sdk-ts-115`.
- cli/ is the scriptable command-line product `@apet97/clockify-cli-115`.
- mcp/ is the agent-facing stdio MCP package
  `@apet97/clockify-mcp-115`.
- spec/ and output/ preserve deterministic generation and evidence.
- GOCLMCP remains the canonical Clockify OpenAPI and Go MCP reference.

The final state should be boringly clear:

- A human can clone the repo, read the first docs, and know exactly how
  to build, test, and safely modify each package.
- An LLM can add one SDK helper, one CLI command, or one MCP workflow
  without editing generated code, weakening security, or guessing gates.
- User-facing examples run or clearly state their required env.
- The SDK, CLI, MCP, and docs share the same names, error semantics,
  pagination posture, auth posture, and live-proof standard.
- Generated code can be replaced by regeneration without losing
  hand-written behavior.

Definition of "vendor-grade" for this repo
------------------------------------------

Do not cargo-cult external vendors. Interpret the bar locally:

- Like Speakeasy-quality output: OpenAPI-driven, customizable through
  safe overlays/hooks/wrappers, CI-aware, typed, documented, pagination
  and retries handled intentionally.
- Like Stainless-quality output: source-normalized, simple generated
  types, diagnostics and breaking changes controlled, no duplicated
  model chaos, no hidden generator drift.
- Like Fern-quality output: source workspace validates, generator is
  pinned, publishing is gated, generated SDK code is structured and
  wrapped by durable package ergonomics.

For this repo, that means:

1. OpenAPI changes begin in GOCLMCP, not in
   spec/corrected/clockify.corrected.openapi.yaml.
2. Generated TypeScript under output/ts-sdk and wrapper/src is never
   hand-edited.
3. Hand-written wrapper APIs stay small and public only when they make a
   real user workflow simpler or safer.
4. CLI and MCP behavior is built on the SDK, not on independent Clockify
   semantics.
5. Docs, tests, package metadata, examples, and CI all agree.

Hard constraints
----------------

- Do not publish to npm.
- Do not push to main unless the user explicitly asks.
- Do not change CI/CD, auth, security, or release automation unless the
  specific finding requires it and you can defend it.
- Do not edit:
  - spec/corrected/clockify.corrected.openapi.yaml
  - output/ts-sdk/**
  - wrapper/src/**
- Do not remove the `-115` / `115` trademark-distance package/bin
  stance.
- Do not rename MCP tool names away from `clockify_*`.
- Do not run live tests against a customer workspace. Use only the
  pinned sandbox env when available.
- Never echo or write API keys/tokens. Check env presence without
  printing values.

How you should code
-------------------

Be adversarial and opinionated:

- Prefer deleting or simplifying over adding an abstraction.
- Treat stale docs as bugs.
- Treat "tests pass" as insufficient for runtime claims.
- Treat generated code churn as suspect unless it follows a generator or
  spec change.
- Treat pretty examples as invalid until type-checked or run.
- Keep exact names, exact commands, exact file paths, and exact evidence.

Use this decision order:

1. If the issue is an API truth issue, inspect GOCLMCP and fix the
   canonical generator/source path there first.
2. If the issue is generated SDK shape, prefer a Fern/OpenAPI annotation
   or generator-source fix over post-processing.
3. If the issue is public TypeScript ergonomics, add or refine a
   hand-written wrapper file outside wrapper/src.
4. If the issue is CLI usability, keep command parsing thin and test
   stdout/stderr/JSON shape.
5. If the issue is MCP usability, prefer workflow tools and structured
   envelopes over more low-level tools.
6. If the issue is docs, make docs executable and remove vague claims.

Do not make broad refactors. Work in slices that can be verified and
committed independently.

Audit targets
-------------

Perform a hostile pass over these surfaces and record findings before
editing:

1. Root guidance and docs:
   - AGENTS.md
   - CLAUDE.md
   - README.md
   - docs/product-north-star.md
   - docs/superpowers/plans/**

2. SDK package:
   - wrapper/package.json
   - wrapper/README.md
   - wrapper/index.ts
   - wrapper/create-client.ts
   - wrapper/composed-fetch.ts
   - wrapper/errors.ts
   - wrapper/iter.ts
   - wrapper/paginated-list.ts
   - wrapper/with-response.ts
   - wrapper/scoped-client.ts
   - wrapper/otel-hooks.ts
   - wrapper/health.ts
   - wrapper/rate-limit.ts
   - wrapper/tests/**

3. CLI package:
   - cli/package.json
   - cli/README.md
   - cli/src/index.ts
   - cli/src/commands/**
   - cli/tests/**

4. MCP package:
   - mcp/package.json
   - mcp/README.md
   - mcp/CHANGELOG.md
   - mcp/src/server.ts
   - mcp/src/result.ts
   - mcp/src/client.ts
   - mcp/src/orchestration/**
   - mcp/src/tools/**
   - mcp/tests/**

5. Canonical/reference repo:
   - ../GOCLMCP/docs/tool-catalog.json
   - ../GOCLMCP/docs/agent-cookbook.md
   - ../GOCLMCP/docs/architecture.md
   - ../GOCLMCP/internal/tools/oneuser_workflows.go
   - ../GOCLMCP/internal/tools/firstslice_recovery.go
   - ../GOCLMCP/internal/safety/token.go

Find and classify issues as:

- Correctness bug: runtime behavior is wrong or docs tell users to do
  something that fails.
- Contract drift: package name/version/tool count/export/example/doc
  disagrees with another source of truth.
- Maintainability drag: bloated file, duplicate helper, unclear boundary,
  or hard-to-test code.
- Product polish gap: confusing names, poor recovery, weak examples,
  missing receipt fields, or non-obvious first-call path.
- Evidence gap: claim lacks deterministic or live proof.

Implementation priorities
-------------------------

Tackle the highest-value issues in this order:

1. Contract drift and stale docs.
   - Package names and versions must match package.json.
   - MCP tool counts must match runtime tools/list.
   - README examples must use real package names.
   - Changelog entries must enumerate actual tools and envelope changes.

2. User/agent first workflows.
   - MCP success envelopes must include useful ids/changed/next when
     mutating.
   - Recoverable failures must have stable error codes and recovery
     hints that tell the caller what to do next.
   - Destructive workflows must dry-run first and reject reused or
     mutated confirmation tokens.

3. SDK ergonomics.
   - createClockifyClient remains the happy path.
   - Pagination helpers are documented and type-tested.
   - Error helpers expose stable status/code handling.
   - OTel/fetch hooks stay dependency-light and optional.

4. CLI polish.
   - Commands mirror user workflows and SDK resource names.
   - JSON output is stable and scriptable.
   - Config/env precedence is tested and documented.

5. Structure and bloat reduction.
   - Split only files that are actively hard to test or reason about.
   - Remove dead helpers and duplicate validation.
   - Do not introduce a framework to organize a dozen functions.

6. Release/readiness evidence.
   - Package-specific gates pass.
   - Cross-package docs agree.
   - Live sandbox proof exists for claims that depend on Clockify
     runtime behavior.

Expected deliverables
---------------------

At minimum, produce:

1. A concise audit report:
   /tmp/clockify-ts-sdk-final-product-audit.md

   It must include:
   - findings table ordered by severity;
   - exact files/lines;
   - whether fixed now or deferred;
   - command evidence;
   - residual risks.

2. Code/docs changes for the highest-value fixable issues.

3. If more work remains, a follow-up plan:
   docs/superpowers/plans/YYYY-MM-DD-clockify-sdk-platform-polish-next.md

   The plan must be implementation-grade:
   - exact files;
   - exact commands;
   - exact tests;
   - TDD steps for behavior changes;
   - no placeholders;
   - no generic "improve docs" tasks.

4. A final summary that says plainly whether the repo is:
   - "vendor-grade enough for local use",
   - "ships with caveats", or
   - "not there yet".

Verification commands
---------------------

Run only the relevant subset for touched areas, but do not claim
completion without fresh output.

Root/docs:

    cd /Users/15x/Downloads/WORKING/addons-me/fern
    git diff --check -- AGENTS.md CLAUDE.md README.md docs wrapper/README.md cli/README.md mcp/README.md
    rg --pcre2 -n "clockify-sdk-ts(?!-115)|v0\\.2\\.0|89 tools|no workflow tools|TODO|TBD" \
      AGENTS.md CLAUDE.md README.md docs wrapper/README.md cli/README.md mcp/README.md \
      --glob '!docs/superpowers/plans/2026-05-26-clockify-sdk-platform-final-state-goal.md'

Wrapper:

    cd /Users/15x/Downloads/WORKING/addons-me/fern/wrapper
    npm run type-check
    npm test
    npm run build
    npm run build:smoke
    npm pack --dry-run

CLI:

    cd /Users/15x/Downloads/WORKING/addons-me/fern/cli
    npm run type-check
    npm test
    npm run build
    npm pack --dry-run

MCP:

    cd /Users/15x/Downloads/WORKING/addons-me/fern/mcp
    npm run type-check
    npm test
    npm run build
    npm pack --dry-run --json

MCP runtime smoke with dummy env for descriptor-only checks:

    cd /Users/15x/Downloads/WORKING/addons-me/fern/mcp
    CLOCKIFY_API_KEY=dummy CLOCKIFY_WORKSPACE_ID=000000000000000000000000 \
      node dist/index.js <<'EOF' | jq '.result.tools | length'
    {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
    EOF

Workflow parity names against Go reference:

    cd /Users/15x/Downloads/WORKING/addons-me/fern/mcp
    jq -r '.tools[] | select(.category=="workflow") | .name' \
      ../../GOCLMCP/docs/tool-catalog.json | sort > /tmp/go-workflow.txt
    CLOCKIFY_API_KEY=dummy CLOCKIFY_WORKSPACE_ID=000000000000000000000000 \
      node dist/index.js <<'EOF' \
      | jq -r '.result.tools[] | .name | select(startswith("clockify_") and (
            startswith("clockify_create_") or startswith("clockify_log_") or
            startswith("clockify_start_") or startswith("clockify_stop_") or
            startswith("clockify_switch_") or startswith("clockify_review_") or
            startswith("clockify_fix_") or startswith("clockify_invoice_client") or
            startswith("clockify_record_expense") or startswith("clockify_request_time") or
            startswith("clockify_schedule_work") or startswith("clockify_setup_webhook") or
            startswith("clockify_tools_guide") or (.=="clockify_status") or
            startswith("clockify_demo_")
        ))' | sort > /tmp/ts-workflow.txt
    {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
    EOF
    diff -u /tmp/go-workflow.txt /tmp/ts-workflow.txt

Live sandbox rule:

If CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are available, use them
without echoing values. Pair every create with cleanup in the same test
or script. Prefix live objects with `final-polish-${Date.now()}` or a
similarly obvious prefix. After live probes, rescan by prefix and prove
zero remaining clients/projects/tags/entries/invoices/webhooks that your
run created.

Final report requirements
-------------------------

Your final answer must include:

- files changed;
- exact commands run and pass/fail results;
- whether live tests ran or skipped;
- any CI status checked;
- what remains intentionally deferred;
- whether the repo now matches the product north star better than when
  you started.

Be blunt. If a surface is still not polished, say so and point to the
next exact fix. Do not call the repo "perfect" unless the evidence earns
that word.
```
