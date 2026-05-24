# roles

2 methods on `client.roles`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `giveUserManagerRole`

**Example:**

```typescript
    await client.roles.giveUserManagerRole({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        body: {
            entityId: "entityId",
            role: "WORKSPACE_ADMIN"
        }
    })
```

**Request fields** (`GiveUserManagerRoleRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.ManagerRoleRequest`, required)

### `removeUserManagerRole`

**Example:**

```typescript
    await client.roles.removeUserManagerRole({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        body: {
            entityId: "entityId",
            role: "WORKSPACE_ADMIN"
        }
    })
```

**Request fields** (`RemoveUserManagerRoleRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.ManagerRoleRequest`, required)

