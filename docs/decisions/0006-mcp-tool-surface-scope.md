# 0006: MCP tool surface scope and SDK method-name parity

## Status

Accepted.

## Context

The TypeScript MCP (`@apet97/clockify-mcp-115`) advertises 140 tools (135 at the
2026-06-22 triage below; +5 read tools shipped 2026-06-28); the sibling
Go MCP reference (`../GOCLMCP`) loads 156. The operation-parity matrix
(`docs/operation-parity.md`) separately records 169 generated SDK methods, 155
explicit OpenAPI group/method names, and 14 governed operationId-derived names.
Quality work requires each scope difference to be either closed or recorded as
a deliberate, justified decision — no silent ceilings. A cross-repo triage
(2026-06-22) reconciled both MCP surfaces fully:
Go's 156 = 98 names shared with TS + 58 Go-only names, while TS additionally
carries 36 names Go lacks (TS splits several Go tools). At the operation level TS
exact-name parity (94) exceeds Go (84).

## Decision

The 140-tool TS surface is a deliberate product decision, not an arbitrary
ceiling (135 at the 2026-06-22 triage below; +5 read tools shipped 2026-06-28).
As of the triage, the 58 Go-only names decompose as:

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
- **17 documented "could-add" backlog candidates** (real, live, SDK-backed ops Go
  surfaces but TS does not yet ship; down from 22 — the first read-tranche of 5
  (`invoices_info`, `invoices_items_list`, `invoices_payments_list`,
  `reports_expense`, `webhooks_events`) shipped 2026-06-28). Earlier highest value: `invoices_payments_list` /
  `_create` / `_delete`, `invoices_items_add` / `_delete` / `_list`,
  `invoices_info` (filterInvoices), `reports_export` (CSV/XLSX/PDF file output),
  `reports_expense`. Secondary: `projects_templates_create` / `_list`,
  `projects_memberships_update` / `_list`, `projects_estimates_update`,
  `custom_fields_set_value`, `entity_changes_list`, `users_deactivate`,
  `workspace_settings`, `webhooks_events`, `time_off_balances_update`,
  `time_off_requests_create` (for-user). These are a conscious backlog, not
  shipped, to keep the surface workflow-first and thin. The literal execution
  roadmap lives in [`../mcp-backlog.md`](../mcp-backlog.md).

For the 14 operations without explicit SDK stamps, the local codegen receipt
proves reachable operationId-derived methods. The governed set is `uploadImage`,
`getCurrentUser`, `addLimitedUsersWithInfo`, `generateDetailedReportV1`,
`changeRecurringPeriod`, `changeTimeOffRequestStatus`, `deleteMany`,
`filterWorkspaceUsers`, `updateUserStatus`, `updateUserCostRate`,
`updateUserCustomFieldValue`, `updateUserHourlyRate`, `findUserTeamManagers`, and
`getWebhookEventStatusesWithLatestLog`. Their expected generated group/method
pairs live in the names-only `docs/sdk-operation-naming-classifications.json`;
every discrepancy anchor is reviewed separately in
`docs/operation-evidence-anchor-inventory.json`, and the resulting attribution
is checked against independent pagination/route/schema expectations in
`docs/operation-evidence-semantic-contract.json`; the resulting attribution or
explicit no-applicable-evidence decision for each of the 169 operations lives in
`docs/operation-evidence-map.json`. Adding explicit stamps is
optional API naming work, not a missing-method fix; any addition, removal,
rename, duplicate, or reclassification now fails the parity gate until that
governance is deliberately updated.

## Consequences

The MCP surface is 140 advertised tools (the 2026-06-28 read-tranche shipped 5
from the backlog: `clockify_invoices_info`, `clockify_invoices_items_list`,
`clockify_invoices_payments_list`, `clockify_reports_expense`,
`clockify_webhooks_events`); the 2026-06-22 Go-only parity gap was accounted for
(8 + 28 + 22) with no silent ceiling, leaving 17 backlog candidates. The 22 backlog
candidates are an explicit, prioritized to-do in `docs/mcp-backlog.md`; the 14
unstamped ops are receipt-proven reachable via their governed
operationId-derived methods. Changing the tool count or shipping a backlog tool is a
deliberate follow-up reviewed against the workflow-first posture; none is
implied to be missing by accident.

## Addendum — 2026-07-22

Roadmap Task 22 adds the read-only `clockify_webhooks_delivery_diagnose` tool,
bringing the current TypeScript MCP surface to 141 tools (22 workflow + 119
domain). It exposes `getWebhookEventStatusesWithLatestLog` as a bounded,
response-body-redacted diagnosis workflow. This roadmap-specific addition was
not one of the original 22 candidates, so the historical 140-tool / 58-Go-only
reconciliation and the 17-candidate remainder above remain unchanged.

## Addendum — 2026-07-22 (Task 23)

Roadmap Task 23 ships the original `updateUserStatus` candidate as the reversible
`clockify_users_set_status` tool, bringing the current TypeScript MCP surface to
142 tools (22 workflow + 120 domain). The privileged tool verifies IDs, names,
and exact emails before issuing an exact-stored-preview token, blocks current-user
deactivation, and supports both `ACTIVE` and `INACTIVE`. Because this was one of
the original 22 candidates, the current backlog remainder is 16; the historical
140-tool / 58-Go-only reconciliation above is unchanged.

## Addendum — 2026-07-22 (Task 24)

Roadmap Task 24 ships the original `updateBalance` candidate as
`clockify_time_off_balances_update`, bringing the current TypeScript MCP surface
to 143 tools (22 workflow + 121 domain). The business-write tool resolves the
policy and every user before issuing an exact-stored-preview token, exposes the
generated `value` strictly as a replacement in the policy's configured unit,
and returns an honest acknowledgement plus balance-list verification guidance
for the endpoint's void response. This leaves 15 original backlog candidates;
the historical 140-tool / 58-Go-only reconciliation remains unchanged.

## Proof

`make operation-parity` regenerates `docs/operation-dispositions.json` and
`docs/operation-parity.{json,md}` by joining the OpenAPI inventory, local codegen
receipt, governed derived-name registry, reviewed discrepancy-anchor inventory,
independent semantic expectations, 169-row operation-evidence audit, TS MCP tool
names, and GOCLMCP tool catalog.
`make operation-coverage` owns the fixture suite and canonical validator, failing
closed on receipt, disposition, classification, path, anchor-review, and
operation-evidence drift; `docs/operation-parity-overrides.json` carries curated MCP
renames. `make mcp-contract` now pins the 143-tool count and split (22 workflow +
121 domain). `make decision-records` verifies this record.
