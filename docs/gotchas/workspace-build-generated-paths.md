# Workspace, build & generated paths

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- The repo is wired as **npm workspaces** from a root `package.json`
  (`workspaces: ["wrapper", "cli", "mcp"]`) with a single root
  `package-lock.json`. Run `npm ci` at the root, then per-package
  scripts work from either the root (`-w <name>`) or the package dir.
- **Transient tsserver diagnostics during/after `npm install` are not real.**
  Consumers resolve wrapper *types* from `wrapper/dist/**`; while npm re-links the
  workspace (or after `make sdk-codegen` regenerates `wrapper/src/**`), the IDE
  briefly reports `"clockify-sdk-ts-115/requests" has no exported member
  ClockifyRequestBody`, `entityId` missing, or `Promise<ResolvedContext>` on every
  tool. Rebuild the wrapper (`npm run build -w clockify-sdk-ts-115`) and run
  `npm run type-check -w <pkg>` — a clean type-check is the source of truth; the
  squiggles clear once `dist` is current. Note cli/mcp `type-check` scope `src/`
  (tests are checked at runtime), so a stale-typed test file shows in the IDE but
  not in `npm run type-check`.
- `output/ts-sdk/**` and `wrapper/src/**` are **gitignored**. A fresh
  clone needs `make sdk-codegen` before SDK package gates can pass.
  The local generator reads `spec/corrected/clockify.corrected.openapi.yaml`
  and does not require Docker, Fern, a hosted SDK-generator account, or
  Clockify credentials.
  Validators (schema-quality, generator-comparison) skip gracefully
  with a clear warning when `wrapper/src/` isn't populated yet.
- `wrapper/src/**` and `output/ts-sdk/**` are generated. Do not edit.
- **CLI/MCP request assertions are a zero baseline.** Run `make
  consumer-cast-budget`. It builds a TypeScript Program over `cli/src` and
  server-reachable `mcp/src`. The exact browser-only App exclusions mirror
  `mcp/tsconfig.build.json`; importing one from server code pulls it back into
  the analysis through TypeScript's import closure. The gate uses symbol
  provenance plus bounded, fail-closed request-bound
  dataflow to reject every way an untyped value could reach a generated
  request — assertions, `as never`, annotated/assigned `any`, helper-hidden
  generics, `Function.call`/`apply`/`bind` trampolines, and erased-to-`any`
  receivers, helpers, or holder properties.

  The exhaustive analysis semantics are the `purpose` field of
  `docs/consumer-cast-budget-contract.json` — that contract is the source of
  truth, so read it there rather than trusting a summary. In practice:
  build generated requests directly, use `ClockifyRequestBody<T>` for typed
  bodies, and keep both canonical exception arrays **empty**. Adding an
  exception needs the full record (location, generated type, discrepancy, open
  risk, evidence, closure target) and is a maintainer decision. The Task 6
  public-package fixture owns the no-`any` adapter proof; do not add a second
  public-type gate.
- `spec/corrected/clockify.corrected.openapi.yaml` is generated upstream by
  GOCLMCP. The only accepted diff here is a straight copy from
  `../GOCLMCP/docs/openapi/clockify-openapi.yaml` after GOCLMCP's generator
  and drift gates pass; in that handoff, run the final full proof as
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_ALLOW_GENERATED_DIFF=1 make perfect-full`.
