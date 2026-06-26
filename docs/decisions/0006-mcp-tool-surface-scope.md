# 0006: MCP tool surface scope and SDK method-name parity

## Status

Accepted.

## Context

The TypeScript MCP (`@clockify115/mcp-server`) advertises 135 tools; the sibling
Go MCP reference (`../GOCLMCP`) loads 156. The operation-parity matrix
(`docs/operation-parity.md`) also shows 13 of the 169 OpenAPI operations with no
SDK method name (the SDK column is `-`). Quality work requires each gap to be
either closed or recorded as a deliberate, justified decision — no silent
ceilings. A cross-repo triage (2026-06-22) reconciled both surfaces fully:
Go's 156 = 98 names shared with TS + 58 Go-only names, while TS additionally
carries 36 names Go lacks (TS splits several Go tools). At the operation level TS
exact-name parity (94) exceeds Go (84).

## Decision

The 135-tool TS surface is a deliberate product decision, not an arbitrary
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

For the 12 operations with no SDK method name: all 12 already have reachable,
operationId-derived generated methods (e.g. `client.users.getCurrentUser`,
`client.scheduling.changeRecurringPeriod`) — none is a MISSING method. They are
unstamped by GOCLMCP's deliberate convention: the `SDK_METHOD_NAMES` table reserves
clean group/method stamps for workspace-scoped CRUDL operations and leaves action
verbs, non-CRUDL, and non-workspace ops on their operationId-derived names
(documented in `../GOCLMCP/scripts/gen-clockify-openapi`: "rate/template/membership/
archive verbs left on operationId-derived names; they're action verbs, not CRUDL").
Five fit that action-verb / non-workspace shape (`getCurrentUser` is the
non-workspace `GET /user`; `filterWorkspaceUsers`, `changeRecurringPeriod`,
`updateUserCustomFieldValue`, `findUserTeamManagers` are filter/find/change/
set-value action verbs); the other seven are the same kind (`uploadImage`; the dead
PUT `member-profile` alias; `changeTimeOffRequestStatus` covered by the
policy-scoped status method; `deleteMany`; the `updateUser*` status/rate PUTs
surfaced through workspace methods). Adding clean stamps is OPTIONAL parity-matrix
completeness, not a functional gap, and would contradict the maintainer's
convention — so it stays as-is.

## Consequences

The MCP surface stays at 135 advertised tools by intent; the 58-name parity gap
is fully accounted for (8 + 28 + 22) with no silent ceiling. The 22 backlog
candidates are an explicit, prioritized to-do; the 12 unstamped ops are reachable
via their operationId-derived methods and intentionally unstamped per convention.
Changing the tool count or shipping a backlog tool is a
deliberate follow-up reviewed against the workflow-first posture; none is
implied to be missing by accident.

## Proof

`make operation-parity` regenerates `docs/operation-parity.{json,md}` by joining
the OpenAPI operations, SDK method stamps, TS MCP tool names, and the GOCLMCP
tool catalog; `docs/operation-parity-overrides.json` carries the curated rename
map. `make mcp-contract` pins the 135-tool count and split (22 workflow + 113
domain). `make decision-records` verifies this record.
