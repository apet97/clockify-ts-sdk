# users

6 methods on `client.users`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getCurrentUser`

### `putWorkspacesWorkspaceIdMemberProfileUserId`

**Request fields** (`PutWorkspacesWorkspaceIdMemberProfileUserIdUsersRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`Record<string, unknown>`, required)

### `findWorkspaceUsers`

**Request fields** (`FindWorkspaceUsersUsersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `email` (`string`, optional) — Filters users by email substring.
- `project-id` (`string`, optional) — If provided, returns users that have access to the project.
- `status` (`"PENDING" \| "ACTIVE" \| "DECLINED" \| "INACTIVE" \| "ALL"`, optional) — Filters users with the corresponding status.
- `account-statuses` (`string`, optional) — Filters users with the corresponding account status filter.
- `name` (`string`, optional) — Filters users by name substring.
- `sort-column` (`"ID" \| "EMAIL" \| "NAME" \| "NAME_LOWERCASE" \| "ACCESS" \| "HOURLYRATE" \| "COSTRATE"`, optional) — Sorting column criteria. Default value: EMAIL
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional) — Sorting mode. Default value: ASCENDING
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `memberships` (`"ALL" \| "NONE" \| "WORKSPACE" \| "PROJECT" \| "USERGROUP"`, optional) — If provided, returns users along with workspaces, groups, or projects they have access to. Default value is NONE.
- `include-roles` (`boolean`, required) — If true, each user's detailed manager roles are included.

### `updateUserCustomFieldValue`

**Request fields** (`UpdateUserCustomFieldValueUsersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `customFieldId` (`string`, required) — Represents a custom field identifier across the system.
- `value` (`unknown \| null`, required) — Represents custom field value.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `customFieldId` (`string`, required) — Represents a custom field identifier across the system.
- `body` (`UpdateUserCustomFieldValueUsersRequestBody`, required)
- `value` (`unknown \| null`, required) — Represents custom field value.

### `findUserTeamManagers`

**Request fields** (`FindUserTeamManagersUsersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `sort-column` (`"ID" \| "EMAIL" \| "NAME" \| "NAME_LOWERCASE" \| "ACCESS" \| "HOURLYRATE" \| "COSTRATE"`, optional) — Sorting column criteria.
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional) — Sorting mode.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.

### `filterWorkspaceUsers`

**Request fields** (`FilterWorkspaceUsersUsersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `accountStatuses` (`ClockifyApi.AccountStatus[]`, optional) — Filters users with the corresponding account status filter.
- `email` (`string`, optional) — Filters users by email substring.
- `includeRoles` (`boolean`, optional) — If true, each user's detailed manager roles are included.
- `memberships` (`"ALL" \| "NONE" \| "WORKSPACE" \| "PROJECT" \| "USERGROUP"`, optional) — Returns users along with workspaces, groups, or projects they have access to.
- `name` (`string`, optional) — Filters users by name substring.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `projectId` (`string`, optional) — If provided, returns users that have access to the project.
- `roles` (`"WORKSPACE_ADMIN" \| "OWNER" \| "TEAM_MANAGER" \| "PROJECT_MANAGER"[]`, optional) — Filters users that have any of the specified roles.
- `sortColumn` (`"ID" \| "EMAIL" \| "NAME" \| "NAME_LOWERCASE" \| "ACCESS" \| "HOURLYRATE" \| "COSTRATE"`, optional) — Sorting criteria.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sorting mode.
- `status` (`"PENDING" \| "ACTIVE" \| "DECLINED" \| "INACTIVE" \| "ALL"`, optional) — Filters users with the corresponding status.
- `userGroups` (`string[]`, optional) — Filters users that belong to the specified user group IDs.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`FilterWorkspaceUsersUsersRequestBody`, required)
- `accountStatuses` (`ClockifyApi.AccountStatus[]`, optional) — Filters users with the corresponding account status filter.
- `email` (`string`, optional) — Filters users by email substring.
- `includeRoles` (`boolean`, optional) — If true, each user's detailed manager roles are included.
- `memberships` (`"ALL" \| "NONE" \| "WORKSPACE" \| "PROJECT" \| "USERGROUP"`, optional) — Returns users along with workspaces, groups, or projects they have access to.
- `name` (`string`, optional) — Filters users by name substring.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `projectId` (`string`, optional) — If provided, returns users that have access to the project.
- `roles` (`"WORKSPACE_ADMIN" \| "OWNER" \| "TEAM_MANAGER" \| "PROJECT_MANAGER"[]`, optional) — Filters users that have any of the specified roles.
- `sortColumn` (`"ID" \| "EMAIL" \| "NAME" \| "NAME_LOWERCASE" \| "ACCESS" \| "HOURLYRATE" \| "COSTRATE"`, optional) — Sorting criteria.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sorting mode.
- `status` (`"PENDING" \| "ACTIVE" \| "DECLINED" \| "INACTIVE" \| "ALL"`, optional) — Filters users with the corresponding status.
- `userGroups` (`string[]`, optional) — Filters users that belong to the specified user group IDs.

