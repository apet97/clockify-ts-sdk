# clients

6 methods on `client.clients`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getWorkspacesWorkspaceIdClients`

**Example:**

```typescript
    await client.clients.getWorkspacesWorkspaceIdClients({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdClientsRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, optional)
- `archived` (`boolean`, optional)
- `address` (`string`, optional)
- `note` (`string`, optional)
- `sort-column` (`ClockifyApi.GetWorkspacesWorkspaceIdClientsRequestSortColumn`, optional)
- `sort-order` (`ClockifyApi.GetWorkspacesWorkspaceIdClientsRequestSortOrder`, optional)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `postWorkspacesWorkspaceIdClients`

**Example:**

```typescript
    await client.clients.postWorkspacesWorkspaceIdClients({
        workspaceId: "workspaceId",
        body: {
            name: "name"
        }
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdClientsRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.ClientCreate`, required)

### `getWorkspacesWorkspaceIdClientsClientId`

**Example:**

```typescript
    await client.clients.getWorkspacesWorkspaceIdClientsClientId({
        workspaceId: "workspaceId",
        clientId: "clientId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdClientsClientIdRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

### `putWorkspacesWorkspaceIdClientsClientId`

**Example:**

```typescript
    await client.clients.putWorkspacesWorkspaceIdClientsClientId({
        workspaceId: "workspaceId",
        clientId: "clientId",
        body: {
            name: "name"
        }
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdClientsClientIdRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `body` (`ClockifyApi.ClientUpdate`, required)

### `deleteWorkspacesWorkspaceIdClientsClientId`

**Example:**

```typescript
    await client.clients.deleteWorkspacesWorkspaceIdClientsClientId({
        workspaceId: "workspaceId",
        clientId: "clientId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdClientsClientIdRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)

### `putWorkspacesWorkspaceIdClientsClientIdArchive`

**Example:**

```typescript
    await client.clients.putWorkspacesWorkspaceIdClientsClientIdArchive({
        workspaceId: "workspaceId",
        clientId: "clientId"
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdClientsClientIdArchiveRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required)
- `archived` (`boolean`, optional)

