# clients

6 methods on `client.clients`.

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
- `currencyCode` (`ClockifyApi.Currency`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)
- `workspaceId` (`string`, required)
- `body` (`ClientCreateBody`, required)
- `address` (`string`, optional)
- `currencyCode` (`ClockifyApi.Currency`, optional)
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
- `address` (`string`, optional)
- `currencyCode` (`ClockifyApi.Currency`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)
- `archived` (`boolean`, optional) — Indicates if client will be archived or not.
- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `body` (`UpdateClientsRequestBody`, required)
- `address` (`string`, optional)
- `currencyCode` (`ClockifyApi.Currency`, optional)
- `email` (`string`, optional)
- `name` (`string`, required)
- `note` (`string`, optional)
- `archived` (`boolean`, optional) — Indicates if client will be archived or not.

### `delete`

**Request fields** (`DeleteClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

### `archive`

**Request fields** (`ArchiveClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `archived` (`boolean`, optional)
- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `body` (`ArchiveClientsRequestBody`, required)
- `archived` (`boolean`, optional)

