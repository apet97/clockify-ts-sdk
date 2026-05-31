<!--
Thanks for the PR. The contributor contract lives in AGENTS.md; this template
keeps review focused on changed surfaces, proof, docs, and residual risk.
Do not paste secrets, customer data, raw live probe captures, or private tokens.
-->

## Summary

<!-- 1-3 sentences. What changed? Why? Link related issues. -->

## Surface

<!-- Tick everything you touched. -->

- [ ] SDK wrapper (`wrapper/*.ts`, `wrapper/tests/**`, `wrapper/examples/**`)
- [ ] CLI (`cli/src/**`, `cli/tests/**`, `cli/README.md`)
- [ ] MCP (`mcp/src/**`, `mcp/tests/**`, `mcp/README.md`)
- [ ] OpenAPI / local generator / GOCLMCP handoff (`scripts/generate-sdk-from-openapi.mjs`, generated metadata)
- [ ] Docs or contracts (`docs/**`, `README.md`, `AGENTS.md`, `CLAUDE.md`)
- [ ] Package/install surface (`package.json`, lockfiles, pack smoke, runtime support)
- [ ] Governance (`SECURITY.md`, `.github/ISSUE_TEMPLATE/**`, PR template)
- [ ] CI/CD or release workflow (`.github/workflows/**`) — requires explicit maintainer approval

## Evidence and gates

<!-- Paste exact commands run, or explain why proof is deferred. Use root gates when possible. -->

- [ ] `make change-impact`
- [ ] Narrow contract gate(s): `make ...`
- [ ] Package gate(s): `make wrapper-gates`, `make cli-gates`, and/or `make mcp-gates`
- [ ] Generated/readme/docs drift: `make readme-tables-drift`, `make docs-index-drift`, `make docs-drift`
- [ ] Acceptance/support proof: `make acceptance-scenarios`, `make issue-intake`, `make support-bundle`
- [ ] Packed consumer proof: `make pack-smoke`
- [ ] Full proof when required: `make perfect-full`
- [ ] Live proof only with sacrificial sandbox: `make perfect-live`

## Docs, changelog, and support

- [ ] User-facing behavior documented in README, migration guide, cookbook, or examples.
- [ ] Touched package changelog updated when public package behavior changed.
- [ ] Support/risk docs updated for new workaround, limitation, live-proof deferral, or provisional state.
- [ ] Breaking-change review completed when any public surface was renamed, removed, or changed meaningfully.

## Diagnostics and support bundle

- [ ] Quickstart receipt impact considered (run `make quickstart-receipt` and review the quickstart receipt artifacts).
- [ ] First-run support workflow impact considered: `node scripts/plan.mjs workflow --workflow first-run-support`.
- [ ] SDK diagnostics impact considered: `clockifyDiagnostics()`.
- [ ] CLI diagnostics impact considered: `clk115 doctor --json`.
- [ ] MCP diagnostics impact considered: `clockify://mcp/doctor`.
- [ ] Support bundle impact considered: `node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json`.
- [ ] If this changes first-run/setup support, first-run workflow, diagnostic surface, and `safeCommandHints` impact are described.
- [ ] If this changes readiness, proof routing, support, or release handoff, `readinessContext` impact is described, including `finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage`.
- [ ] No support artifact includes env values, tokens, workspace IDs, raw logs, probe captures, browser cookies, shell history, or `.env` files.

## Generated-path discipline

- [ ] Did not hand-edit `spec/corrected/**`.
- [ ] Did not hand-edit `output/ts-sdk/**`.
- [ ] Did not hand-edit `wrapper/src/**`.
- [ ] Did not commit raw probe files from `spec/evidence/probes/*.{json,hdr}`.

## Residual risk

<!-- What remains unproven, deferred, blocked upstream, or intentionally accepted? -->

- Risk:
- Owner / next proof:
