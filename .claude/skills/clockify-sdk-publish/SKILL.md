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
must be set. All three publish-capable workflows are tag-only and have no
`workflow_dispatch` trigger. Use the read-only Workspace CI workflow for manual branch
proof.

## Order matters

The CLI and MCP **peer-depend on `clockify-sdk-ts-115`**, so publish the SDK first:
push `wrapper-v*` and let it land on npm before pushing `cli-v*` / `mcp-v*`.

## Sequence

1. **Prove green:** `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` (solo),
   then `make perfect-full`. Drain `[Unreleased]` into a `## [X.Y.Z]` changelog heading.
2. **Bump versions** (only what changed): edit `package.json`; for `mcp` also bump
   `mcp/manifest.json`; then update the lockfile and run `make version-consistency`
   so generated runtime constants and governed mirrors match. All package versions
   are hand-cut; release-please is retired.
3. **Land on `main`** (PR or focused commit), all CI green.
4. **Set the secret** (once): `gh secret set NPM_TOKEN` (the token is automation/granular).
5. **Tag + push** (never force a tag — verify it does not already exist locally or
   remotely, then create it once against the exact merged commit; SDK first, then wait
   for it to publish before tagging CLI/MCP). This requires explicit maintainer
   authorization:
   ```bash
   TAG="wrapper-v0.9.0"        # then cli-v*, then mcp-v*
   EXPECTED_SHA="<merged main HEAD sha>"
   git show-ref --verify --quiet "refs/tags/$TAG" && { echo "tag exists locally" >&2; exit 1; }
   git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1 && {
       echo "tag exists remotely" >&2
       exit 1
   }
   git tag "$TAG" "$EXPECTED_SHA"
   git push origin "refs/tags/$TAG"
   ```
6. **Watch + verify:** `gh run watch <id> --exit-status`; then
   `npm view <pkg> version dist-tags`. Provenance shows under `npm view <pkg> dist.attestations`.

## Gotchas (live-verified)

- **SDK SBOM is required.** The release workflow generates, validates, and attaches
  the SPDX document. A missing or invalid SBOM fails the release workflow.
- **Prefixed tags are manual and package-specific.** `make tag-hygiene` forbids bare
  `v*.*.*` local tags — always use the prefixed `wrapper-v*`, `cli-v*`, or `mcp-v*`
  form after the matching package version is committed.
- **MCPB asset:** the `mcp-v*` workflow builds and inspects the exact `.mcpb`,
  validates its SPDX document, and attaches both assets to the GitHub Release.
  Remove stale local bundle artifacts before a local smoke; do not attach release
  assets manually.

## Hard stops

No laptop `npm publish`; no tag that mismatches `package.json`; no force-pushed tags; no
release-workflow/auth changes without explicit approval. Policy: `docs/release-support-policy.md`,
`docs/decisions/0003-no-default-npm-publish.md`. Preflight planner:
`node scripts/plan.mjs release-decision --decision all`.
