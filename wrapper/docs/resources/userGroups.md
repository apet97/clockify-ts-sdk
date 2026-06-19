# userGroups

8 methods on `client.userGroups`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Request fields** (`UserGroupRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, required) — Represents a user group name.
- `workspaceId` (`string`, required)
- `body` (`UserGroupRequestBody`, required)
- `name` (`string`, required) — Represents a user group name.

### `get`

**Request fields** (`GetUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)

### `update`

**Request fields** (`UpdateUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `name` (`string`, required) — Represents a user group name.
- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `body` (`UpdateUserGroupsRequestBody`, required)
- `name` (`string`, required) — Represents a user group name.

### `delete`

**Request fields** (`DeleteUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)

### `listMembers`

**Request fields** (`ListMembersUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)

### `addMembers`

**Request fields** (`AddMembersUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `body` (`AddMembersUserGroupsRequestBody`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.

### `removeMember`

**Request fields** (`RemoveMemberUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `userId` (`string`, required)

