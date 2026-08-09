# Clockify TypeScript SDK · CLI · MCP

An **unofficial, community-built** TypeScript toolkit for [Clockify](https://clockify.me/) in
three install-and-go layers — an **SDK**, a **CLI**, and an **MCP server**. The published
OpenAPI and the live API disagree in a few dozen places; each one this toolkit works around
is written down with the evidence behind it — and where that evidence is a document rather
than a live probe, the entry says so. Read
[`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md).

> Not affiliated with, endorsed by, or sponsored by CAKE.com or Clockify. "Clockify" is a
> trademark of CAKE.com, used here only nominatively to identify the public API these packages
> integrate against; the `-115` / `115` suffixes are deliberate trademark distance. See
> [NOTICE.md](./NOTICE.md).

## Pick your layer

| Package | What it is | Reach for it when… |
|---|---|---|
| **`clockify-sdk-ts-115`** ([docs](./wrapper/README.md)) | SDK — 30 resource modules, 168 generated operations (149 explicit + 19 operationId-derived), dual ESM/CJS | You call Clockify from Node/TypeScript and want typed errors, pagination, webhooks, and OTel hooks. |
| **`@apet97/clockify-cli-115`** ([docs](./cli/README.md)) | CLI — the `clk115` / `clockify115` binaries | You want time tracking and admin from the terminal or scripts, with `table`/`json`/`ndjson` output. |
| **`@apet97/clockify-mcp-115`** ([docs](./mcp/README.md)) | MCP server — 163 stdio tools | You want an AI agent (Claude, etc.) to drive Clockify safely, with dry-run + confirm-token writes. |

All three are published to npm under the unofficial `@apet97` scope (the SDK is unscoped) —
community-built, **not affiliated with CAKE.com or Clockify**. Install only what you need; no
clone required.

## Get started

**1 · Get your credentials (once).** In Clockify, open **Profile → API** and generate an API
key, then copy your **Workspace ID** from the workspace URL
(`app.clockify.me/workspaces/<workspaceId>/…`).

```sh
export CLOCKIFY_API_KEY=...        # your Clockify API key
export CLOCKIFY_WORKSPACE_ID=...   # the workspace to act on
```

**2 · Pick a layer and run it.**

### 🖥️ CLI — the fastest way to try it

```sh
npm i -g @apet97/clockify-cli-115        # installs the clk115 + clockify115 binaries

clk115 status                                  # who am I, which workspace, any running timer?
clk115 start "WIP refactor" --project "Acme"   # resolves the project name to an id for you
clk115 projects list --json                    # machine-readable output for scripts
clk115 --help                                  # every command and flag
```

### 📦 SDK — call Clockify from TypeScript

```sh
npm i clockify-sdk-ts-115
```

```ts
import { createClockifyClient } from "clockify-sdk-ts-115";

const clockify = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY });
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID!;

const projects = await clockify.projects.list({ workspaceId, "page-size": 50 });
```

Auth, pagination, typed errors, webhooks, and observability hooks are documented in the
[SDK README](./wrapper/README.md); runnable scripts live in [`examples/`](./examples/README.md).
Two helpers kill the boilerplate: `clockify-sdk-ts-115/resolve` turns a **name** into a real id
(case-insensitive, with a grounded "did you mean?" on a miss), and `clockify-sdk-ts-115/dates`
resolves `"yesterday"` / `"next Monday"` / period keywords to the exact instants the API wants.

### 🤖 MCP server — let an AI agent drive Clockify

```sh
npm i -g @apet97/clockify-mcp-115        # provides the clockify115-mcp binary
```

Add it to your MCP client (Claude Desktop, or any `mcpServers` config):

```jsonc
{
  "mcpServers": {
    "clockify": {
      "command": "clockify115-mcp",
      "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." }
    }
  }
}
```

Call `clockify_status` first; read the `clockify://guide/which-tool` resource to route a request
to the right tool. Risky writes preview with `dry_run: true` and commit with the returned
`confirm_token`. For a one-click Claude Desktop `.mcpb` bundle, see the
[MCP README](./mcp/README.md).


## Build from source / contribute

The three packages are npm workspaces; the SDK source is generated locally from the corrected
OpenAPI snapshot — deterministic and offline (no Docker, Fern, hosted generator, or Clockify
credentials):

```sh
git clone https://github.com/apet97/clockify-ts-sdk.git
cd clockify-ts-sdk
node scripts/repo-doctor.mjs   # run this first: no-network repo-shape check, fails fast and clearly
npm ci                         # install all three workspaces
make sdk-codegen               # generate output/ts-sdk/** and sync wrapper/src/**
make perfect-fast              # local runtime/package proof: type-check, build, smoke, tests
```

`node scripts/repo-doctor.mjs` runs no network, git, or build steps — it just confirms the repo
shape (Node 22.13+, the three workspaces, the local-generator wiring) so a fresh clone fails fast
before `npm ci`. The first three rows are the pre-push gate tiers; `perfect-live` is separate
credentialed sandbox proof:

| Gate | What it proves |
|---|---|
| `make contract-gates` | CI-enforced readiness and doc/contract drift suite; run locally before push |
| `make perfect-fast` | Deterministic local SDK/CLI/MCP runtime/package proof (no network, no live Clockify) |
| `make perfect-full` | Runs `contract-gates` **and** adds heavy proof: GOCLMCP spec drift, codegen determinism, packed-consumer smoke, coverage, and manual mutation-workflow wiring |
| `make perfect-live` | Separate explicit sandbox cleanup proof (needs a sacrificial `CLOCKIFY_API_KEY`) |

`make help` lists every focused gate. The contribution workflow, contract system, and
spec/generator relationship are in [`CONTRIBUTING.md`](./CONTRIBUTING.md); the full
documentation index is [`docs/README.md`](./docs/README.md). The canonical OpenAPI is **not** in
this repo — it is produced by the sister project `apet97/go-clockify` (cloned as `../GOCLMCP/`)
and snapshotted into `spec/corrected/`.

## Layout

```
clockify-ts-sdk/
├── wrapper/   clockify-sdk-ts-115        — the SDK package
├── cli/       @apet97/clockify-cli-115   — the CLI package
├── mcp/       @apet97/clockify-mcp-115   — the stdio MCP package
├── examples/  runnable SDK / CLI / MCP examples
├── spec/      corrected + official OpenAPI snapshots and the evidence ledger
├── scripts/   local generator + contract checkers
├── docs/      product docs, policies, and generated truth surfaces (see docs/README.md)
└── Makefile   one-command local / full / live gates
```

## Status

| Package | Version | Surface |
|---|---|---|
| `clockify-sdk-ts-115` | 5.0.0 | 30 resource modules, 168 generated operations (149 explicit + 19 operationId-derived), dual ESM/CJS, typed multi-service routing, pagination, webhook verification, typed errors, scoped clients, OTel/health/rate-limit helpers, name/date resolution |
| `@apet97/clockify-cli-115` | 5.0.0 | 66 commands incl. CRUD for `projects`/`clients`/`tags`/`tasks`/`expenses`, `reports`, `shared-reports`, `users`, a scriptable raw `api`, environment-only credential auth, `--region`/`--subdomain` routing, `table`/`json`/`ndjson` output, recovery hints, shell completion |
| `@apet97/clockify-mcp-115` | 5.0.0 | 163 stdio tools (23 workflow + 140 domain), guide resources, `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN` routing, `changed`/`next` envelopes, dry-run confirmation |

**Upgrading to 5.0.0**: two type-level breaks, no runtime change.
`StartTimerTimeEntriesRequest` now requires `body` (it previously
type-checked a bulk edit that sent nothing), and 29 generated interfaces
gained `[key: string]: unknown`, which widens `keyof`, disables
excess-property checking on annotated object literals, and makes them
assignable to `Record<string, unknown>`. Earlier majors' breaking changes
(4.0.0's `currencyCode` removal and error-message change, the 2.0.0
wire-truth trio, and the rest) are in the
[migration guide](./docs/migration-guide.md) and each package changelog.

Two defaults are worth knowing either way. **Routing:** a typed `routing`
option selects a region, workspace subdomain, or per-service host; only the
`global` profile is live-confirmed, so anything else needs an explicit
`acknowledgeUnconfirmedRegion: true`. **Retries are read-only:** `PUT` and
`DELETE` are not auto-retried, because a failure after a mutation is ambiguous
— opt in with `retryMutationMethods: true`. Both are covered in
[`wrapper/README.md`](./wrapper/README.md).

Release history is in each package's `CHANGELOG.md`.

## License

MIT. See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting.
