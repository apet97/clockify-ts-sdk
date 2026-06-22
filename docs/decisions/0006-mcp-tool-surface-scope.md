# 0006: MCP tool surface scope and SDK method-name parity

## Status

Accepted.

## Context

The TypeScript MCP (`@clockify115/mcp-server`) advertises 134 tools; the sibling
Go MCP reference (`../GOCLMCP`) loads 156. The operation-parity matrix
(`docs/operation-parity.md`) also shows 12 of the 184 OpenAPI operations with no
SDK method name (the SDK column is `-`). Quality work requires each gap to be
either closed or recorded as a deliberate, justified decision — no silent
ceilings. A cross-repo triage (2026-06-22) reconciled both surfaces fully:
Go's 156 = 98 names shared with TS + 58 Go-only names, while TS additionally
carries 36 names Go lacks (TS splits several Go tools). At the operation level TS
exact-name parity (94) exceeds Go (84).

## Decision

The 134-tool TS surface is a deliberate product decision, not an arbitrary
ceiling. The 58 Go-only names decompose as:

- **8 intentional Go-only exclusions.** Two raw API-fallback tools
  (`clockify_api_get`, `clockify_api_request`) — raw passthrough is the Go MCP's
  niche; the TS MCP is a pure typed Node package (AGENTS.md "raw API fallback
  last"; north-star "thin layers"). Three guidance-only tools
  (`clockify_invoices_send_guidance`, `clockify_invoices_items_update_guidance`,
  `clockify_webhooks_test_guidance`) describe absent Clockify endpoints. Two
  dead-route single-GET tools (`clockify_custom_fields_get` returns 405,
  `clockify_holidays_get` has no get-one endpoint) — the TS MCP reads via
  list-scan. One 404-deferred tool (`clockify_scheduling_user_totals`, route not
  bound live).
- **28 naming-only renames.** The same operation under a TS workflow-first or
  split name (e.g. Go `clockify_users_role` → TS `clockify_users_grant_role` +
  `clockify_users_revoke_role`; Go `clockify_entries_create` → TS
  `clockify_entries_log`; Go `clockify_groups_add_user` → TS
  `clockify_groups_add_member`). Curated parity reasons live in
  `docs/operation-parity-overrides.json`.
- **22 documented "could-add" backlog candidates** (real, live, SDK-backed ops Go
  surfaces but TS does not yet ship). Highest value: `invoices_payments_list` /
  `_create` / `_delete`, `invoices_items_add` / `_delete` / `_list`,
  `invoices_info` (filterInvoices), `reports_export` (CSV/XLSX/PDF file output),
  `reports_expense`. Secondary: `projects_templates_create` / `_list`,
  `projects_memberships_update` / `_list`, `projects_estimates_update`,
  `custom_fields_set_value`, `entity_changes_list`, `users_deactivate`,
  `workspace_settings`, `webhooks_events`, `time_off_balances_update`,
  `time_off_requests_create` (for-user). These are a conscious backlog, not
  shipped, to keep the surface workflow-first and thin.

For the 12 operations with no SDK method name: 5 are real stamping gaps
(`getCurrentUser`, `changeRecurringPeriod`, `filterWorkspaceUsers`,
`updateUserCustomFieldValue`, `findUserTeamManagers`) closeable by adding
`x-fern-sdk-method-name` stamps in the GOCLMCP `SDK_METHOD_NAMES` table
(data-only, flows in via re-snapshot); 7 are intentional (`uploadImage` unstamped
binary upload; the dead PUT `member-profile` alias; `changeTimeOffRequestStatus`
covered by the policy-scoped status method; `deleteMany`; and the `updateUser*`
status/rate PUTs surfaced through workspace methods).

## Consequences

The MCP surface stays at 134 advertised tools by intent; the 58-name parity gap
is fully accounted for (8 + 28 + 22) with no silent ceiling. The 22 backlog
candidates and the 5 SDK stamping gaps are an explicit, prioritized to-do.
Changing the tool count, shipping a backlog tool, or adding a stamp is a
deliberate follow-up reviewed against the workflow-first posture; none is
implied to be missing by accident.

## Proof

`make operation-parity` regenerates `docs/operation-parity.{json,md}` by joining
the OpenAPI operations, SDK method stamps, TS MCP tool names, and the GOCLMCP
tool catalog; `docs/operation-parity-overrides.json` carries the curated rename
map. `make mcp-contract` pins the 134-tool count and split (21 workflow + 113
domain). `make decision-records` verifies this record.
