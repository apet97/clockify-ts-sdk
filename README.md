# Clockify TypeScript SDK · CLI · MCP

A TypeScript toolkit for [Clockify](https://clockify.me/) in three layers, all
built from one corrected OpenAPI snapshot and the same hard-won, **live-verified**
knowledge of how the real API behaves:

| Package | What it is | Use it for |
|---|---|---|
| **`clockify-sdk-ts-115`** ([`wrapper/`](./wrapper/README.md)) | The SDK — 29 resource modules, 169 operations, dual ESM/CJS | Calling Clockify from Node/TypeScript with typed errors, pagination, webhooks, and OTel hooks |
| **`@clockify115/cli`** ([`cli/`](./cli/README.md)) | The CLI — `clockify115` / `clk115` | Time tracking and admin from the terminal or scripts, with `table`/`json`/`ndjson` output |
| **`@clockify115/mcp-server`** ([`mcp/`](./mcp/README.md)) | The MCP server — 134 stdio tools | Letting an agent (Claude, etc.) drive Clockify safely, with dry-run + confirm-token writes |

The three share two pure helper subpaths so you never hand-roll them:
`clockify-sdk-ts-115/resolve` turns a **name** into a real id (case-insensitive,
with a grounded "did you mean?" on a miss), and `clockify-sdk-ts-115/dates`
resolves `"yesterday"` / `"next Monday"` / period keywords to the instants the API
wants.

> **Why another Clockify SDK?** The published OpenAPI is wrong in ~20 places that
> silently corrupt data — invoice tax/discount zeroing, mixed minor/major money
> units, dead single-GET routes, archive-before-delete. Every such quirk here was
> found against the **real API** and is pinned by a regression test. The evidence
> ledger is [`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md).

> **Not affiliated with Clockify.** This is an independent, community-built
> project — not affiliated with, endorsed by, sponsored by, or approved by
> CAKE.com or Clockify. "Clockify" is a trademark of CAKE.com, used here only
> nominatively to identify the public API these packages integrate against; the
> `-115` / `115` suffixes are deliberate trademark distance. See
> [NOTICE.md](./NOTICE.md).

## Quick start

### SDK

```ts
import { createClockifyClient } from "clockify-sdk-ts-115";

const clockify = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY });
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID!;
const projects = await clockify.projects.list({ workspaceId, "page-size": 50 });
```

Auth, pagination, typed errors, webhooks, and observability hooks are documented
in the [SDK README](./wrapper/README.md). Runnable scripts live in
[`examples/`](./examples/README.md).

### CLI

```sh
npm install -g @clockify115/cli   # or: npm pack, then install the tarball
export CLOCKIFY_API_KEY=...        # Clockify › Profile › API Keys
export CLOCKIFY_WORKSPACE_ID=...

clk115 status
clk115 start "WIP refactor" --project "Acme"   # resolves the name to an id
clk115 projects list --json
```

### MCP server

```jsonc
// Claude Desktop / any MCP client — add to the client's mcpServers config
{
  "mcpServers": {
    "clockify": {
      "command": "clockify115-mcp",
      "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." }
    }
  }
}
```

Call `clockify_status` first; read the `clockify://guide/which-tool` resource to
route a request to the right tool. Risky writes preview with `dry_run: true` and
commit with the returned `confirm_token`. See the [MCP README](./mcp/README.md).

> Packages ship as local tarballs (`npm pack`) by default — this is not public npm publication. Publishing requires explicit maintainer approval.

## Develop

The three packages are npm workspaces, and the SDK source is generated locally
from the corrected OpenAPI snapshot (deterministic, offline — no Docker, Fern,
hosted generator, or Clockify credentials):

```sh
git clone https://github.com/apet97/clockify-ts-sdk.git
cd clockify-ts-sdk
node scripts/repo-doctor.mjs   # start here: no-network repo-shape check (Node, workspaces, codegen wiring)
npm ci                 # install all three workspaces
make sdk-codegen       # generate output/ts-sdk/** and sync wrapper/src/**
make perfect-fast      # the local gate: type-check, build, dual-build smoke, tests, contracts
```

`node scripts/repo-doctor.mjs` is the obvious first command: it runs no network,
git, or build steps — it just confirms the repo shape (Node 20+, the three
workspaces, the local-generator wiring) so a fresh clone fails fast and clearly
before `npm ci`.

Three gate tiers:

| Command | What it proves |
|---|---|
| `make perfect-fast` | Deterministic local SDK/CLI/MCP package proof (no network, no live Clockify) |
| `make perfect-full` | Adds GOCLMCP spec drift, codegen determinism, and a packed-consumer smoke |
| `make perfect-live` | Explicit sandbox cleanup proof (needs a sacrificial `CLOCKIFY_API_KEY`) |

`make help` lists every focused gate. Contribution workflow, the contract system,
and the spec/generator relationship are in [`CONTRIBUTING.md`](./CONTRIBUTING.md);
the full documentation index is [`docs/README.md`](./docs/README.md). The canonical
OpenAPI is **not** in this repo — it is produced by the sister project
`apet97/go-clockify` (cloned as `../GOCLMCP/`) and snapshotted into
`spec/corrected/`.

## Layout

```
clockify-ts-sdk/
├── wrapper/   clockify-sdk-ts-115   — the SDK package
├── cli/       @clockify115/cli      — the CLI package
├── mcp/       @clockify115/mcp-server — the stdio MCP package
├── examples/  runnable SDK / CLI / MCP examples
├── spec/      corrected + official OpenAPI snapshots and the evidence ledger
├── scripts/   local generator + contract checkers
├── docs/      product docs, policies, and generated truth surfaces (see docs/README.md)
└── Makefile   one-command local / full / live gates
```

## Status

| Package | Version | Surface |
|---|---|---|
| `clockify-sdk-ts-115` | 0.9.0 | 29 resource modules, 169 operations, dual ESM/CJS, pagination, webhook verification, typed errors, scoped clients, OTel/health/rate-limit helpers, name/date resolution |
| `@clockify115/cli` | 0.1.0 | 59 commands incl. CRUD for `projects`/`clients`/`tags`/`tasks`/`expenses`, `reports`, `shared-reports`, `users`, a scriptable raw `api`, env/config auth, `table`/`json`/`ndjson` output, recovery hints, shell completion |
| `@clockify115/mcp-server` | 0.3.0 | 134 stdio tools (21 workflow + 113 domain), guide resources, `changed`/`next` envelopes, dry-run confirmation |

Release history is in each package's `CHANGELOG.md`; the repo-level quality bar is
[`docs/product-north-star.md`](./docs/product-north-star.md).

## License

MIT. See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting.
