# auditLogReport

1 methods on `client.auditLogReport`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `search`

**Request fields** (`SearchAuditLogReportRequest`):

- `workspaceId` (`string`, required)
- `actions` (`string[]`, required)
- `authors` (`Record<string, unknown>`, required) — Author filter. Include SYSTEM to retrieve system audit logs.
- `end` (`string`, required) — Audit window end.
- `page` (`number`, optional)
- `page-size` (`number`, optional)
- `start` (`string`, required) — Audit window start.
- `workspaceId` (`string`, required)
- `body` (`SearchAuditLogReportRequestBody`, required)
- `actions` (`string[]`, required)
- `authors` (`Record<string, unknown>`, required) — Author filter. Include SYSTEM to retrieve system audit logs.
- `end` (`string`, required) — Audit window end.
- `page` (`number`, optional)
- `page-size` (`number`, optional)
- `start` (`string`, required) — Audit window start.

