# roles

2 methods on `client.roles`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `giveUserManagerRole`

**Request fields** (`GiveUserManagerRoleRolesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `entityId` (`string`, required) — Represents an entity identifier across the system.
- `role` (`"WORKSPACE_ADMIN" \| "TEAM_MANAGER" \| "PROJECT_MANAGER"`, required) — Represents a valid role.
- `sourceType` (`"USER_GROUP"`, optional) — Optional field used to indicate that the target of the operation is a user group.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`GiveUserManagerRoleRolesRequestBody`, required)
- `entityId` (`string`, required) — Represents an entity identifier across the system.
- `role` (`"WORKSPACE_ADMIN" \| "TEAM_MANAGER" \| "PROJECT_MANAGER"`, required) — Represents a valid role.
- `sourceType` (`"USER_GROUP"`, optional) — Optional field used to indicate that the target of the operation is a user group.

### `removeUserManagerRole`

**Request fields** (`RemoveUserManagerRoleRolesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `entityId` (`string`, required) — Represents an entity identifier across the system.
- `role` (`"WORKSPACE_ADMIN" \| "TEAM_MANAGER" \| "PROJECT_MANAGER"`, required) — Represents a valid role.
- `sourceType` (`"USER_GROUP"`, optional) — Optional field used to indicate that the target of the operation is a user group.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`RemoveUserManagerRoleRolesRequestBody`, required)
- `entityId` (`string`, required) — Represents an entity identifier across the system.
- `role` (`"WORKSPACE_ADMIN" \| "TEAM_MANAGER" \| "PROJECT_MANAGER"`, required) — Represents a valid role.
- `sourceType` (`"USER_GROUP"`, optional) — Optional field used to indicate that the target of the operation is a user group.

