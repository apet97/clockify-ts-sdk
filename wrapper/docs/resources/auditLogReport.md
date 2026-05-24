# auditLogReport

1 methods on `client.auditLogReport`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `search`

**Example:**

```typescript
    await client.auditLogReport.search({
        workspaceId: "workspaceId",
        actions: ["CREATE_PROJECT", "UPDATE_PROJECT"],
        authors: {},
        end: "2026-05-15T23:59:59Z",
        start: "2026-05-14T00:00:00Z"
    })
```

**Request fields** (`AuditLogRequest`):

- `workspaceId` (`string`, required)
- `actions` (`string[]`, required)
- `authors` (`AuditLogRequest.Authors`, required) — Author filter. Include SYSTEM to retrieve system audit logs.
- `end` (`string`, required) — Audit window end.
- `page` (`number`, optional)
- `page-size` (`number`, optional)
- `start` (`string`, required) — Audit window start.

