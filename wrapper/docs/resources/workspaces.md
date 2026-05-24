# workspaces

10 methods on `client.workspaces`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getAllMyWorkspaces`

**Example:**

```typescript
    await client.workspaces.getAllMyWorkspaces()
```

**Request fields** (`GetAllMyWorkspacesRequest`):

- `roles` (`ClockifyApi.GetAllMyWorkspacesRequestRolesItem \| ClockifyApi.GetAllMyWorkspacesRequestRolesItem[]`, optional) — If provided, returns workspaces where the user has any of the specified roles. Owners are not counted as admins when filtering.

### `addWorkspace`

**Example:**

```typescript
    await client.workspaces.addWorkspace({
        name: "Cool Company",
        organizationId: "67d471fb56aa9668b7bfa295"
    })
```

**Request fields** (`CreateWorkspaceRequest`):

- `name` (`string`, required) — Represents a workspace name.
- `organizationId` (`string`, required) — Represents the Cake organization identifier across the system.

### `getWorkspaceInfo`

**Example:**

```typescript
    await client.workspaces.getWorkspaceInfo({
        workspaceId: "64a687e29ae1f428e7ebe303"
    })
```

**Request fields** (`GetWorkspaceInfoRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.

### `putWorkspacesWorkspaceId`

**Example:**

```typescript
    await client.workspaces.putWorkspacesWorkspaceId({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdRequest`):

- `workspaceId` (`string`, required)

### `updateWorkspaceCostRate`

**Example:**

```typescript
    await client.workspaces.updateWorkspaceCostRate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        body: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        }
    })
```

**Request fields** (`UpdateWorkspaceCostRateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ClockifyApi.UpdateCostRateRequest`, required)

### `updateWorkspaceBillableRate`

**Example:**

```typescript
    await client.workspaces.updateWorkspaceBillableRate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        amount: 2000,
        currency: "USD",
        since: "2020-01-01T00:00:00Z"
    })
```

**Request fields** (`UpdateWorkspaceBillableRateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `amount` (`number`, required) — Represents an amount as integer.
- `currency` (`string`, required) — Represents a currency.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `addUserToWorkspace`

**Example:**

```typescript
    await client.workspaces.addUserToWorkspace({
        workspaceId: "64a687e29ae1f428e7ebe303",
        "send-email": "true",
        email: "<EMAIL>"
    })
```

**Request fields** (`AddUserToWorkspaceRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `send-email` (`ClockifyApi.AddUserToWorkspaceRequestSendEmail`, required) — Indicates whether to send an email when user is added to the workspace.
- `email` (`string`, required) — Represents an email address of the user.

### `updateUserStatus`

**Example:**

```typescript
    await client.workspaces.updateUserStatus({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "89b687e29ae1f428e7ebe912",
        status: "ACTIVE"
    })
```

**Request fields** (`UpdateUserStatusRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `status` (`UpdateUserStatusRequest.Status`, required) — Represents membership status.

### `updateUserCostRate`

**Example:**

```typescript
    await client.workspaces.updateUserCostRate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "89b687e29ae1f428e7ebe912",
        body: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        }
    })
```

**Request fields** (`UpdateUserCostRateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.UpdateCostRateRequest`, required)

### `updateUserHourlyRate`

**Example:**

```typescript
    await client.workspaces.updateUserHourlyRate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "89b687e29ae1f428e7ebe912",
        amount: 20000,
        since: "2020-01-01T00:00:00Z"
    })
```

**Request fields** (`UpdateUserHourlyRateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `amount` (`number`, required) — Represents an hourly rate amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

