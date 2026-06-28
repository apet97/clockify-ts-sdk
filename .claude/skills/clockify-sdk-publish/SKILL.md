---
name: clockify-sdk-publish
description: Publish the clockify-ts-sdk npm packages (clockify-sdk-ts-115, @apet97/clockify-cli-115, @apet97/clockify-mcp-115) via CI on a pushed version tag, with provenance. Use when releasing a new version, cutting a tag, or wiring the release workflow. Never npm-publish from a laptop.
---

# Publishing clockify-ts-sdk (tag-gated CI)

All three packages publish to npm under the **unofficial `@apet97` scope** (the SDK is
unscoped) via GitHub Actions on a pushed **prefixed** tag whose version matches the
package's `package.json`. Never run `npm publish` from a laptop.

| Package | npm name | Tag | Workflow |
|---|---|---|---|
| SDK | `clockify-sdk-ts-115` | `wrapper-v*.*.*` | `.github/workflows/release.yml` |
| CLI | `@apet97/clockify-cli-115` | `cli-v*.*.*` | `.github/workflows/ci-cli-release.yml` |
| MCP | `@apet97/clockify-mcp-115` | `mcp-v*.*.*` | `.github/workflows/ci-mcp-release.yml` |

Each workflow verifies the tag matches `package.json`, then publishes with provenance
(OIDC `id-token: write` + `publishConfig.provenance: true`). The `NPM_TOKEN` repo secret
must be set. Manual `workflow_dispatch` runs build/pack only (publish is gated to
`github.ref_type == 'tag'`).

## Order matters

The CLI and MCP **peer-depend on `clockify-sdk-ts-115`**, so publish the SDK first:
push `wrapper-v*` and let it land on npm before pushing `cli-v*` / `mcp-v*`.

## Sequence

1. **Prove green:** `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` (solo),
   then `make perfect-full`. Drain `[Unreleased]` into a `## [X.Y.Z]` changelog heading.
2. **Bump versions** (only what changed): edit `package.json`; for `mcp` also bump
   `mcp/manifest.json` + the `mcp/src/server.ts` `version:` literal; then `npm install` so
   the lockfile matches (else `dependency-boundary` reds). The **wrapper version is owned
   by release-please** — let its PR drive the SDK bump; don't hand-bump `wrapper` and fight it.
3. **Land on `main`** (PR or focused commit), all CI green.
4. **Set the secret** (once): `gh secret set NPM_TOKEN` (the token is automation/granular).
5. **Tag + push** (re-point the tag to the merged HEAD first if needed):
   ```bash
   git tag -f wrapper-v0.9.0 HEAD && git push origin wrapper-v0.9.0   # SDK first
   # wait for it to publish, then:
   git tag -f cli-v0.1.0 HEAD && git push origin cli-v0.1.0
   git tag -f mcp-v0.4.0 HEAD && git push origin mcp-v0.4.0
   ```
6. **Watch + verify:** `gh run watch <id> --exit-status`; then
   `npm view <pkg> version dist-tags`. Provenance shows under `npm view <pkg> dist.attestations`.

## Gotchas (live-verified)

- **SDK SBOM step is best-effort.** `npm sbom` fails `EINVALIDPURLTYPE` on the versionless
  private workspace root; `release.yml` marks it `continue-on-error` and uploads the SBOM
  only if a non-empty file exists, so a SBOM hiccup never fails the workflow *after* a
  successful publish. The publish still lands.
- **release-please uses component tags.** Config has `include-component-in-tag: true` +
  `component: "wrapper"` → it files `wrapper-v*` PRs. `make tag-hygiene` forbids bare
  `v*.*.*` local tags — always use the prefixed forms.
- **MCPB asset:** after `mcp-v*` publishes, `make mcpb-smoke` builds + inspects
  `mcp/clockify115-mcp-<version>.mcpb`; attach it with
  `gh release create mcp-vX.Y.Z … mcp/clockify115-mcp-X.Y.Z.mcpb` (remove any stale
  older `.mcpb` first — the smoke glob chokes on two).

## Hard stops

No laptop `npm publish`; no tag that mismatches `package.json`; no force-pushed tags; no
release-workflow/auth changes without explicit approval. Policy: `docs/release-support-policy.md`,
`docs/decisions/0003-no-default-npm-publish.md`. Preflight planner:
`node scripts/plan.mjs release-decision --decision all`.
