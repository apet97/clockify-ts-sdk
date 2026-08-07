# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/generator-tooling.md (create it). You work OFFLINE — no live API calls needed (but you may make them if useful).

YOUR GROUP: GENERATOR + OPENAPI TOOLING + NORMALIZATION + LEDGER QUALITY.

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only — the Ruby generator: PHANTOM_PATHS, merge_parameters, canonicalize_path_params, ensure_path_parameters!, merge_components, apply_live_overrides!, SOURCE_PRIORITIES, status_bucket, TAG_RENAMES, SDK_METHOD_NAMES, PAGINATED_LIST_OPS, LAST_PAGE_HEADER_OPS, stamp_path_param_patterns!)
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/scripts/official-openapi-report.mjs and scripts/official-openapi-drift.mjs (the drift tooling)
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/docs/official-openapi-drift-policy.md

LEDGER ENTRIES TO AUDIT (grep for IDs):
1. `gen-clockify-openapi.merge_parameters.destructive-concat` (~42) — RESOLVED: verify the fix in the generator source
2. `time-off-b.yaml.changedForUserName.malformed-inline-yaml` (~478) — verify the source fragment is fixed
3. `gen-clockify-openapi.pagination-params-stamped` (~517) — verify 21 endpoints stamped
4. `fern.x-fern-pagination.bare-array-unsupported` (~574) — HISTORICAL (Fern retired); verify claim
5. `fern.x-fern-sdk-method-name.drops-resource-modules` (~719) — PARTIALLY-RESOLVED: verify 149 ops / 27 modules claim via x-fern-sdk-group-name/x-fern-sdk-method-name counts in corrected spec
6. `tag-renames.singular-to-plural` (~946) — verify
7. `deferred-list-endpoints.not-paginated-or-not-live` (~992) — verify
8. `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive` (~1150) — CLOSED-BY-LOCAL-GENERATOR: verify the local generator (scripts/sdk-codegen/emitter.mjs) models mutually exclusive auth
9. `gen-clockify-openapi.status_bucket.405-conflated-with-phantom` (~3167) — RESOLVED: verify the status_bucket fix in the generator
10. `audit-log.actions.closed-enum` (~289) — verify AuditLogAction enum in corrected spec + source fragment
11. `sdk.resource-duplication` (~211), `strictness.wrapper-eopt-noimplicitoverride-blocked` (~2634), `consumer.cast-budget` (~2668) — verify claims about local generator templates (scripts/sdk-codegen/emitter.mjs)

STRUCTURAL CHECKS (offline, using node with the repo's yaml package — run from the repo dir, NEVER write anything to the repo; you may write helper scripts to /tmp):
a. Validate both specs parse + all $refs resolve internally (write a small script: walk every $ref, resolve against components, report unresolvable or cyclic ones)
b. Count operations/schemas in official vs corrected vs official-live.json; compute operation-level semantic diff (canonicalize paths: strip /v1 prefix, collapse {params} to {}); classify diffs as: opId rename / tag rename / param changes / requestBody changes / response changes / servers / security. Produce counts.
c. Verify the corrected spec's x-clockify-live-status distribution (how many live-success / probe-documented / documented / unsupported?)
d. Check whether the corrected spec still contains any operation marked with summary containing "DOCUMENTED BUT BROKEN" or similar — list them
e. Check PHANTOM_PATHS in the generator vs the corrected spec: are all quarantined paths absent from the corrected spec? (iterate the array and grep the corrected YAML for each)
f. Verify the claim that spec/corrected is byte-identical to ../GOCLMCP/docs/openapi/clockify-openapi.yaml (compare hashes)
g. Check the corrected spec's parameter counts for GET /clients, GET /tags, GET /shared-reports/{id}, PUT /clients/{id} vs official-live.json (the unledgered-difference candidates: does the corrected spec drop official params? list every param the corrected spec lacks vs live official, per operation — focus on query params)
h. Check response schema refs: ops where corrected declares a DIFFERENT response schema name than official-live.json for the same op (list them — e.g. GET /shared-reports/{id}: corrected SharedReport vs live TimeEntrySummaryReport)
i. Check request body schemas: ops where corrected's request schema name differs from official-live.json (list; e.g. UpdateClientRequestV1 vs ClientUpdate)
j. OpenAPI validation: try npx @redocly/cli lint on a COPY of both specs in /tmp (npm install in /tmp only, NOT the repo — use a temp dir; if install fails, skip and note). Record tool version + results.
k. Run the repo's own drift report read-only: `node scripts/official-openapi-drift.mjs --report` and `--check` (check exits nonzero if docs stale — that's OK, record the exit code; do NOT run --write). Also `node scripts/official-openapi-drift.mjs --fetch` records live-official additions — already known: 7 ops (5 deprecated templates + removeMember + getProjectTotals). Assess whether the drift tooling would HIDE any meaningful drift (read its normalization: canonicalizePath, operationKey — what does it NOT compare? e.g. request/response schemas, enums, requiredness?).

Report sections:
A. Per-ledger-entry verdicts (ID | status | what the generator/source actually does today | confidence | recommended action)
B. Structural check results (a-k) with exact counts
C. UNLEDGERED-DIFFERENCES found by your independent diff (each: official claim, corrected claim, likely reason, severity, judgment: justified correction vs unexplained)
D. Weakness assessment of the repo's drift tooling (what it can miss)
Redact the API key everywhere; the env key is only needed if you run live probes (you mostly don't).

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```