# userGroups

6 methods on `client.userGroups`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListUserGroupsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `project-id` (`string`, optional) — If provided, you'll get a filtered list of groups that matches the string provided in their project id.
- `name` (`string`, optional) — If provided, you'll get a filtered list of groups that matches the string provided in their name.
- `sort-column` (`ClockifyApi.UserGroupSortColumn`, optional) — Column to be used as the sorting criteria.
- `sort-order` (`ClockifyApi.UserGroupsSortOrder`, optional) — Sorting mode.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `includeTeamManagers` (`boolean`, optional) — If provided, you'll get a list of team managers assigned to this user group.

### `create`

**Request fields** (`UserGroupRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, required) — Represents a user group name.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`UserGroupRequestBody`, required)
- `name` (`string`, required) — Represents a user group name.

### `update`

**Request fields** (`UpdateUserGroupsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `groupId` (`string`, required)
- `name` (`string`, required) — Represents a user group name.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `groupId` (`string`, required)
- `body` (`UpdateUserGroupsRequestBody`, required)
- `name` (`string`, required) — Represents a user group name.

### `delete`

**Request fields** (`DeleteUserGroupsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `groupId` (`string`, required)

### `addMembers`

**Request fields** (`AddMembersUserGroupsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `groupId` (`string`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `groupId` (`string`, required)
- `body` (`AddMembersUserGroupsRequestBody`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.

### `removeMember`

**Request fields** (`RemoveMemberUserGroupsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `groupId` (`string`, required)

