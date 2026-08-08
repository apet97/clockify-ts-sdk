# clients

5 methods on `client.clients`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListClientsRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, optional)
- `archived` (`boolean`, optional)
- `address` (`string`, optional)
- `note` (`string`, optional)
- `sort-column` (`"NAME" \| "EMAIL" \| "NOTE"`, optional)
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `create`

**Request fields** (`ClientCreate`):

- `workspaceId` (`string`, required)
- `address` (`string`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)
- `workspaceId` (`string`, required)
- `body` (`ClientCreateBody`, required)
- `address` (`string`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)

### `get`

**Request fields** (`GetClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

### `update`

**Request fields** (`UpdateClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `archive-projects` (`boolean`, optional)
- `mark-tasks-as-done` (`boolean`, optional)
- `address` (`string`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)
- `archived` (`boolean`, optional) — Indicates if client will be archived or not.
- `ccEmails` (`string[]`, optional) — Additional invoice recipients. Honoured on PUT only; a create ignores it. At most three addresses — a fourth returns 400 `{"message":"Number of additional emails must be less than 3","code":501}`, whose wording is off by one. Omitting the field on an update clears the stored list.
- `currencyId` (`string`, optional) — Id of one of the workspace's currencies. Honoured on PUT only; a create ignores it and falls back to the workspace default. Sticky when omitted from an update.
- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `archive-projects` (`boolean`, optional)
- `mark-tasks-as-done` (`boolean`, optional)
- `body` (`UpdateClientsRequestBody`, required)
- `address` (`string`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)
- `archived` (`boolean`, optional) — Indicates if client will be archived or not.
- `ccEmails` (`string[]`, optional) — Additional invoice recipients. Honoured on PUT only; a create ignores it. At most three addresses — a fourth returns 400 `{"message":"Number of additional emails must be less than 3","code":501}`, whose wording is off by one. Omitting the field on an update clears the stored list.
- `currencyId` (`string`, optional) — Id of one of the workspace's currencies. Honoured on PUT only; a create ignores it and falls back to the workspace default. Sticky when omitted from an update.

### `delete`

**Request fields** (`DeleteClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

