# clients

6 methods on `client.clients`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.clients.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListClientsRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, optional)
- `archived` (`boolean`, optional)
- `address` (`string`, optional)
- `note` (`string`, optional)
- `sort-column` (`ClockifyApi.ListClientsRequestSortColumn`, optional)
- `sort-order` (`ClockifyApi.ListClientsRequestSortOrder`, optional)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Example:**

```typescript
    await client.clients.create({
        workspaceId: "workspaceId",
        body: {
            name: "name"
        }
    })
```

**Request fields** (`CreateClientsRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.ClientCreate`, required)

### `get`

**Example:**

```typescript
    await client.clients.get({
        workspaceId: "workspaceId",
        clientId: "clientId"
    })
```

**Request fields** (`GetClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.clients.update({
        workspaceId: "workspaceId",
        clientId: "clientId",
        body: {
            name: "name"
        }
    })
```

**Request fields** (`UpdateClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `body` (`ClockifyApi.ClientUpdate`, required)

### `delete`

**Example:**

```typescript
    await client.clients.delete({
        workspaceId: "workspaceId",
        clientId: "clientId"
    })
```

**Request fields** (`DeleteClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

### `archive`

**Example:**

```typescript
    await client.clients.archive({
        workspaceId: "workspaceId",
        clientId: "clientId"
    })
```

**Request fields** (`ArchiveClientsRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `archived` (`boolean`, optional)

