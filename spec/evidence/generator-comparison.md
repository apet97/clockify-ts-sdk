# Generator comparison — Fern vs Speakeasy vs Stainless

> **HISTORICAL (Phase 0 spike).** This compared generators when the repo still used
> Fern. It has since migrated to the local generator
> `scripts/generate-sdk-from-openapi.mjs` (ADR 0005) and ships dual ESM/CJS; the spec
> is now 184 operations / 31 tags with ~687 synced TS files. The Fern-era figures
> (193 ops, 723 files, "keep Fern?" framing) below are the point-in-time snapshot,
> retained as historical context.

Phase 0 spike for the Stainless/Speakeasy-quality push. Answers
"should we keep generating with Fern, or migrate to Speakeasy /
Stainless for v1.0?" with evidence, not vibes.

The plan file driving this work lives outside the repo at
`/Users/15x/.claude/plans/read-agents-md-claude-delegated-dijkstra.md`.
The verdict landed here is referenced from
`discrepancies.md` →
`generator.choice.fern-vs-stainless-vs-speakeasy`.

## Method

- **Spec under test:** `spec/corrected/clockify.corrected.openapi.yaml`
  (frozen snapshot of GOCLMCP's canonical, regenerated 2026-05-24).
  720 KB, OpenAPI 3.0.3, 193 operations across 32 tags.
- **Fern row:** read from the live `wrapper/` tree (already
  generated + synced + built + tested).
- **Speakeasy row:** `speakeasy v1.763.6` (Homebrew), `speakeasy
  generate sdk --lang typescript --schema <spec> --out
  experiments/speakeasy --auto-yes`. Transcript at
  `experiments/speakeasy.log`. Scaffolded `.speakeasy/gen.yaml`
  captured for config-knob inspection.
- **Stainless row:** not evaluated. Stainless is SaaS-only (no CLI);
  evaluating requires registering at stainless.com, uploading the
  spec via portal, and downloading the generated ZIP. Deferred per
  scope decision after Speakeasy's hard failure made the verdict
  obvious. Flagged below as a follow-up if the next reviewer
  disagrees with the verdict.

## Per-generator status

| Generator | Generation status | Files emitted | Hard errors | Spec hints | Style warnings |
|---|---|---|---|---|---|
| **Fern 5.37.9** (current) | ✅ clean | 723 TS files synced into `wrapper/src/` | 0 | 0 (legacy parser fires 8 known literal-vs-id warnings; `--from-openapi` reports 0/0 — see `discrepancies.md` → `fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings`) | 0 |
| **Speakeasy 1.763.6** | ❌ **halted** — generation refused | 0 TS files (only `.speakeasy/gen.yaml` + `.speakeasy/gen.lock` scaffolded) | **1** — `generator-duplicate-properties` on `rtl` (line 18970) vs `RTL` (line 18963) in `components.schemas.OpenapiInvoiceExportFields` | 199 (mostly `generator-missing-error-response`, `generator-duplicate-inline-schemas`, `generator-pagination`, `generator-retries`) | 4 (`style-operation-success-response`: 4 ops with no 2xx response) + 4 `semantic-unused-component` |
| **Stainless** | ⏭ not evaluated | — | — | — | — |

The Speakeasy hard failure is the load-bearing data point. The same
spec Fern handles cleanly is refused by Speakeasy's identifier-
collision detector. Concrete cite:

```yaml
# spec/corrected/clockify.corrected.openapi.yaml lines 18963-18972
OpenapiInvoiceExportFields:
  description: Represents an invoice export fields object.
  properties:
    RTL:
      type: boolean
      writeOnly: true
    itemType:
      type: boolean
    # ...
    rtl:
      type: boolean
```

Both `RTL` and `rtl` are real Clockify API fields with distinct
semantics (`RTL` is `writeOnly`; `rtl` is read-write). Speakeasy
normalizes both to the TS identifier `Rtl` and refuses to emit a
type with two fields of the same identifier. Fern emits both
fields as distinct TS members. This is a generator-design
disagreement, not a spec bug — the spec is internally
conformant.

## Rubric (cell evidence inline)

| Capability | Fern (current) | Speakeasy | Stainless |
|---|---|---|---|
| **Method naming** | OperationId-derived: `client.tags.getWorkspacesWorkspaceIdTags(...)`. Non-idiomatic. CRUDL stamping attempted via `x-fern-sdk-method-name` previously dropped 12 of 31 modules (ledger entry `fern.x-fern-sdk-method-name.drops-resource-modules`). | Tag-grouped CRUDL by default (would emit `client.tags.list()`). Cannot verify on this spec — generation halted. | — |
| **Auto-pagination (bare arrays)** | ❌ not supported in CLI 5.37.9; ledger entry `fern.x-fern-pagination.bare-array-unsupported`. Wrapper ships hand-written `paginate<T>` as workaround. | Supported via `x-speakeasy-pagination` extension (suggested in ≥10 ops per validation hints). Vendor-specific annotation. | — |
| **Error hierarchy depth** | Base `ClockifyApiError` (`statusCode`, `body`, `rawResponse`, `cause`) + `ClockifyApiTimeoutError` + per-status `BadRequest(400)`, `Unauthorized(401)`, `Forbidden(403)`, `NotFound(404)`, `MethodNotAllowed(405)`. | Configurable via `clientServerStatusCodesAsErrors: true` (default) in `gen.yaml`. Generates per-status error classes. Spec needs `4xx`/`5xx` responses declared (currently 199 ops are missing them per `generator-missing-error-response`). | — |
| **Retry config customizability** | `maxRetries` per-request and per-client; backoff (initial 1s, max 60s), jitter (20%), retryable status codes (408/429/5xx), and `Retry-After` / `X-RateLimit-Reset` handling are hard-coded in `wrapper/src/core/fetcher/requestWithRetries.ts`. Not overridable without forking the synced fetcher (or wrapping it externally — Phase 1.6 of the plan does this). | Configurable per-op via `x-speakeasy-retries` extension. Global `Retry` strategy in `gen.yaml`. Vendor lock-in for the annotation. | — |
| **Observability hooks** | Structured logger (debug/error) that logs URL + status but not headers (so there is nothing to redact; callers that log headers via the lifecycle hooks redact their own). No request/response/error/retry middleware hooks. Custom `fetch` override is the closest escape hatch. | `sdkHooksConfigAccess: true` default — first-class user-extensible hooks system. | — |
| **Dual ESM+CJS** | ESM only. `wrapper/package.json` is `"type": "module"`. Phase 2 of the plan adds dual build via `tsup`. | `moduleFormat: esm` default in `gen.yaml`. Configurable. | — |
| **Runtime validation (Zod / similar)** | None. Types are TS-only; no runtime parse step. | Zod (`zodVersion: v4-mini` default in `gen.yaml`). Adds ~12 KB minified per resource for runtime validation. | — |
| **MCP server generation from same spec** | Not in scope for Fern TS generator. The sister repo GOCLMCP hand-writes the MCP layer in Go. | Opt-in via `enableMCPServer: true` in `gen.yaml`. Speakeasy has a separate `mcp-typescript` language target. Could in principle generate both the SDK and the MCP server from the same spec, displacing GOCLMCP's Go MCP layer. | — |
| **Supply-chain signing** | ✅ npm publish with `--provenance` via OIDC (already wired in `release.yml`). | Documented; depends on workflow. Same npm/OIDC mechanism. | — |
| **License & cost** | Fern OSS (Apache 2.0); generator container public; Fern Cloud paid but not required for local generation. | OSS CLI (free for OSS / lean tier); paid tiers for enterprise governance, managed registries, multi-language. | — |
| **Lock-in risk** | Low. `x-fern-*` annotations live in `spec/fern/` (workspace config), not in the canonical upstream spec at `../GOCLMCP/`. Migrating away requires re-generating once; no spec changes. | **High.** Migration requires (a) resolving the `rtl/RTL` collision in the upstream Clockify-derived spec (rename or merge), (b) adding `x-speakeasy-*` annotations across the spec for pagination + retries + naming + error responses, (c) adopting `gen.yaml` per-target config knobs, (d) introducing Zod (or opting out and losing the SDK's runtime validation), (e) re-running GOCLMCP's 4 drift gates after every spec change. | — |
| **Migration cost estimate** | $0 (status quo). | Estimated 3-5 dev-days minimum: 1 day to patch the spec + add vendor annotations, 1 day to re-run GOCLMCP gates, 1 day to wire the Speakeasy CI pipeline + verify the dual ESM+CJS Zod-laden output, 1-2 days to migrate the live sandbox tests + retest 193 ops. | — |

## Verdict

**Stay on Fern.** Execute the wrapper-side ergonomic plan
(Phases 1-8) without changing the generator.

Reasoning:

1. **Speakeasy fails on the current spec** (`rtl`/`RTL` collision)
   while Fern succeeds. The fail is in Speakeasy's identifier
   normalizer, not the spec. Migration would either require an
   upstream Clockify-spec rename (coordination cost we don't
   control) or a Speakeasy-specific override annotation
   (vendor lock-in).
2. **Fern's runtime baseline is already strong.** The features the
   user feels (retries, error hierarchy, abort signals, custom fetch,
   passthrough) are all present in `wrapper/src/core/`.
   See `generator-comparison.md` → "Rubric" rows 3-5 above.
3. **The remaining gaps are wrapper-side, not generator-side.**
   Per-resource auto-pagination, `createClockifyClient()` factory,
   webhook verifier, middleware, request IDs, dual ESM+CJS — every
   item in Phases 1-2 of the plan is a hand-written module that
   lives outside `wrapper/src/**` and survives sync. Switching
   generators wouldn't shortcut any of them.
4. **Speakeasy's unique upsides** (Zod, MCP server generation,
   first-class hooks API, configurable retry policy via spec
   annotations) are real but not load-bearing for the current scope.
   Zod can be retrofitted as a wrapper layer if needed; the MCP
   server already exists in GOCLMCP (Go); hooks come from Phase 1.5;
   configurable retries come from Phase 1.6.
5. **Lock-in asymmetry** favors Fern: Fern's vendor annotations
   live in `spec/fern/`, isolated from the upstream Clockify-derived
   canonical at `../GOCLMCP/`. Speakeasy's annotations would have
   to live in the canonical spec itself, polluting the source of
   truth that the Go MCP layer also consumes.

The verdict reopens automatically if any of these changes:

- Fern CLI drops `x-fern-pagination` bare-array support **and**
  Speakeasy ships a `disable-rule` flag for `generator-duplicate-properties`.
- Clockify renames `OpenapiInvoiceExportFields.rtl` / `RTL` upstream
  (would unblock Speakeasy).
- GOCLMCP's Go MCP layer is retired in favor of a Speakeasy-emitted
  MCP server (separate strategic call).
- The wrapper-side ergonomic burden grows beyond ~10 hand-written
  modules — at which point migrating to a generator that emits
  them natively becomes worth the cost.

## What this comparison does NOT answer

- **Stainless head-to-head.** Without a portal account, the third
  competitive offering is unevaluated. Likely outcome (educated
  guess, not evidence): Stainless would also hit the `rtl`/`RTL`
  collision since it normalizes identifiers similarly. If a future
  reviewer disagrees with the verdict above, the next step is to
  re-run Phase 0 with a Stainless portal upload added.
- **Per-resource generated quality.** Because Speakeasy halted, we
  can't compare method-signature ergonomics, error-class
  completeness, or the runtime SDK surface side-by-side. The
  comparison is generator-level, not output-level.
- **Multi-language story.** Fern emits TS + Python + Postman from
  the same spec (already wired in `spec/fern/generators.yml`).
  Speakeasy supports those plus more (Go, Java, Ruby, PHP, C#,
  Unity, Terraform). If a future need surfaces for non-TS
  generation, re-evaluate.

## References

- Spike transcript: `experiments/speakeasy.log` (199 hints, 5
  warnings, 1 error, exit non-zero).
- Speakeasy scaffolded config: `experiments/speakeasy/.speakeasy/gen.yaml`.
- Fern current output: `output/ts-sdk/` (723 files, clean) →
  synced into `wrapper/src/`.
- Discrepancies entry capturing this decision:
  `discrepancies.md` → `generator.choice.fern-vs-stainless-vs-speakeasy`.
- Driving plan: `/Users/15x/.claude/plans/read-agents-md-claude-delegated-dijkstra.md`
  → Phase 0.
