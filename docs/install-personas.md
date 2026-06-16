# Install Personas

This repo has three user-facing packages. Pick the path that matches what you are trying to do.

## SDK user

Use this when you are writing TypeScript or JavaScript code and want direct Clockify API access.

```bash
cd wrapper
npm install
npm run build
npm pack
npm install ./clockify-sdk-ts-115-0.9.0.tgz
```

Minimal code:

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";

const client = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY! });
const tags = await client.tags.list({ workspaceId: process.env.CLOCKIFY_WORKSPACE_ID! });
console.log(tags);
```

Before trusting a tarball, run:

```bash
make pack-smoke
```

## CLI user

Use this when you want terminal commands or scriptable JSON.

```bash
cd cli
npm install
npm run build
npm link
export CLOCKIFY_API_KEY=...
export CLOCKIFY_WORKSPACE_ID=...
clk115 status
clk115 --json tags list --limit 5
```

Optional shell completions:

```bash
clk115 completion zsh > ~/.zfunc/_clk115
clk115 completion bash > ~/.clk115-completion.bash
clk115 completion fish > ~/.config/fish/completions/clk115.fish
```

`CLOCKIFY_BASE_URL` and `--base-url` are only for mock/replay gateways or private test environments. Do not set them for normal Clockify use.

## MCP user

Use this when an MCP client should call Clockify tools.

```bash
cd mcp
npm install
npm run build
npm link
```

MCP client config:

```json
{
  "mcpServers": {
    "clockify": {
      "command": "clockify115-mcp",
      "env": {
        "CLOCKIFY_API_KEY": "your_key_here",
        "CLOCKIFY_WORKSPACE_ID": "your_workspace_id_here"
      }
    }
  }
}
```

Start with `clockify_status`, then prefer workflow tools such as `clockify_create_work_package`, `clockify_log_work`, and `clockify_review_day` before low-level domain tools.

## Distribution personas (how you ship and update)

The default stance is **local tarballs, not public npm publication**. The three
distribution personas below cover how a consumer installs, smoke-tests, updates,
debugs, and reasons about security for each path. All three install the same
packages (`clockify-sdk-ts-115`, `@clockify115/cli`, `@clockify115/mcp-server`).

### 1. Local tarball user (default)

You consume a `npm pack` artifact directly — no registry involved.

- **Install:** `cd wrapper && npm run build && npm pack`, then
  `npm install ./clockify-sdk-ts-115-0.9.0.tgz` in your project (same shape for
  `cli`/`mcp`). Commit the resolved tarball integrity to your lockfile.
- **Smoke test:** `make pack-smoke` (builds, packs, installs into a throwaway
  consumer, and imports the public surface) and `make pack-snapshot-check` (the
  tarball file list matches the golden `wrapper/.packsnapshot`).
- **Update path:** re-pack on each version bump and re-pin the new tarball; diff
  `wrapper/.packsnapshot` to see exactly which files changed in the artifact.
- **Support / debug:** `node scripts/repo-doctor.mjs`, `clk115 doctor`, and the
  `clockify://mcp/doctor` MCP resource.
- **Security:** the tarball ships only `dist`, `README.md`, `LICENSE`; verify with
  `npm pack --dry-run`. Never embed `CLOCKIFY_API_KEY` in code — read it from env.

### 2. Internal registry user

You republish to a private registry (Verdaccio, Artifactory, GitHub Packages).

- **Install:** point the scope/registry at your internal host, then
  `npm install clockify-sdk-ts-115` as usual.
- **Smoke test:** `make pack-smoke` before publish; in the consumer repo, an
  import smoke that resolves the public surface.
- **Update path:** republish on version bump; let Renovate/Dependabot pin ranges.
  Keep `wrapper/CHANGELOG.md` authoritative for what changed.
- **Support / debug:** the same doctors; if your registry records provenance,
  verify signatures on install.
- **Security:** keep registry auth tokens server-side; run `make supply-chain` and
  `make dependency-license` before publishing internally.

### 3. Future public npm user

Public npm publication is **not** the default and requires explicit maintainer
approval; `publishConfig` and the `prepublishOnly` gates stay intact.

- **Install:** `npm install clockify-sdk-ts-115` once published.
- **Smoke test:** the same `make pack-smoke`; consumers can verify provenance.
- **Update path:** track semver; watch `wrapper/CHANGELOG.md` and
  [`migration-guide.md`](./migration-guide.md) for breaking changes.
- **Support / debug:** file issues per [`issue-intake-policy.md`](./issue-intake-policy.md);
  attach a `make support-bundle` artifact.
- **Security:** releases would carry sigstore provenance via the gated release
  workflow; the `-115` suffix is intentional trademark distance from Clockify.
