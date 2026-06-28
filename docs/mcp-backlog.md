# MCP Backlog

This is the literal roadmap for the 22 accepted "could-add" MCP candidates from
[ADR 0006](./decisions/0006-mcp-tool-surface-scope.md) — the first read-tranche
of 5 shipped 2026-06-28 (surface 135 → 140), leaving 17. Shipping any row means
adding the tool, tests, docs, operation parity overrides if needed, and the
normal count cascade in one deliberate patch.

First tranche (SHIPPED 2026-06-28): the low-risk read tools `clockify_invoices_info`,
`clockify_invoices_items_list`, `clockify_invoices_payments_list`,
`clockify_webhooks_events`, and `clockify_reports_expense` — surface 135 → 140.

| Candidate tool | SDK method | User workflow | Risk | Confirm | CLI mirror | Required tests | Decision |
|---|---|---|---|---|---|---|---|
| `clockify_invoices_info` | `client.invoices.filter` | Find invoices by status/client/date without raw API fallback. | read | no | no | MCP schema, success envelope, filter pass-through, permission recovery. | shipped 2026-06-28 |
| `clockify_invoices_items_list` | `client.invoices.get` | Inspect invoice line items before changing an invoice. | read | no | no | MCP schema, item extraction, empty invoice, not-found recovery. | shipped 2026-06-28 |
| `clockify_invoices_items_add` | `client.invoiceItems.create` | Add a line item to an existing invoice. | write, billing | no | optional | Dry request shape, success receipt, invoice id/item fields, 4xx recovery. | defer |
| `clockify_invoices_items_delete` | `client.invoiceItems.delete` | Remove one invoice line item by order. | destructive, billing | yes | optional | Dry-run token, confirmed delete, tamper rejection, order-vs-id wording. | defer |
| `clockify_invoices_payments_list` | `client.invoicePayments.list` | Review payments before marking an invoice paid. | read | no | no | MCP schema, invoice id pass-through, empty list, not-found recovery. | shipped 2026-06-28 |
| `clockify_invoices_payments_create` | `client.invoicePayments.create` | Record a payment against an invoice. | write, billing | no | optional | Body shape, amount/date validation, success receipt, duplicate-risk wording. | defer |
| `clockify_invoices_payments_delete` | `client.invoicePayments.delete` | Remove an invoice payment. | destructive, billing | yes | optional | Dry-run token, confirmed delete, tamper rejection, payment id pass-through. | defer |
| `clockify_reports_expense` | `client.expenseReport.generateDetailedReportV1` | Run the detailed expense report from MCP. | read | no | no | Report filter pass-through, reports host, large-result envelope, recovery. | shipped 2026-06-28 |
| `clockify_reports_export` | `client.reports.detailed` | Export detailed report data in supported formats. | binary export | no | no | Format handling, file/base64 envelope, size cap, redaction. | defer |
| `clockify_projects_templates_list` | `client.projects.list` with `is-template` | Reuse project templates during setup. | read | no | no | Pagination, `is-template` filter, list metadata, empty result. | defer |
| `clockify_projects_templates_create` | `client.projects.create` plus template flag | Create a reusable project template. | write | no | optional | Create body, receipt, rollback guidance, duplicate-name recovery. | defer |
| `clockify_projects_memberships_list` | `client.projects.get` | Inspect project memberships before admin changes. | read, admin | no | no | Hydrated project read, membership extraction, not-found recovery. | defer |
| `clockify_projects_memberships_update` | `client.projects.updateMemberships` | Replace or patch project memberships. | write, admin, permission_change | yes | optional | Dry-run token, confirmed write, membership body, permission recovery. | defer |
| `clockify_projects_estimates_update` | `client.projects.updateEstimate` | Update project budget/time estimates. | write | no | optional | Request shape, receipt, invalid estimate recovery. | defer |
| `clockify_custom_fields_set_value` | `client.customFields.updateForProject` / `client.timeEntries.update` | Set a custom field value on a project or entry. | write, admin | yes | no | Entity routing, dry-run token, body preservation for entries, recovery. | defer |
| `clockify_entity_changes_list` | `client.entityChangesExperimental.listCreated/listUpdated/listDeleted` | Audit recent entity changes by type and time range. | read | no | no | Change-type routing, pagination, experimental warning, envelope. | defer |
| `clockify_users_deactivate` | `client.workspaces.updateUserStatus` | Deactivate a workspace user. | write, admin | yes | optional | Dry-run token, confirmed status update, self-target guard, recovery. | defer |
| `clockify_workspace_settings` | `client.workspaces.get` | Inspect workspace settings for support and recovery. | read, admin | no | no | Read envelope, redaction, permission recovery, no mutation path. | defer |
| `clockify_webhooks_events` | static event registry / `client.webhooks` metadata | Pick a valid webhook event before setup. | read | no | no | Static registry, schema stability, setup-webhook integration. | shipped 2026-06-28 |
| `clockify_time_off_balances_update` | `client.balances.update` | Adjust balances under a time-off policy. | write, admin, billing | yes | no | Dry-run token, user ids, delta/value semantics, recovery probe. | defer |
| `clockify_time_off_requests_create` | `client.timeOff.submit` | Create a time-off request under a policy. | write, admin | yes | no | Dry-run token, period body, approval/balance warning, recovery. | defer |
| `clockify_time_off_requests_create_for_user` | `client.timeOff.submitForUser` | Create a time-off request for another user. | write, admin | yes | no | Dry-run token, user id resolution, period body, permission recovery. | defer |

Acceptance rule: read tools need schema, success envelope, recovery envelope, and
list metadata when paginated. Writes need receipts. Destructive, admin, billing,
permission, and balance-changing writes need the existing `dry_run` to
`confirm_token` guard before mutation.
