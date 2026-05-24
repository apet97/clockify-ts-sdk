# users

6 methods on `client.users`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getCurrentUser`

**Example:**

```typescript
    await client.users.getCurrentUser()
```

**Request fields** (`GetCurrentUserRequest`):

- `include-memberships` (`boolean`, optional) — If set to true, memberships will be included.

### `putWorkspacesWorkspaceIdMemberProfileUserId`

**Example:**

```typescript
    await client.users.putWorkspacesWorkspaceIdMemberProfileUserId({
        workspaceId: "workspaceId",
        userId: "userId",
        body: {
            "key": "value"
        }
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdMemberProfileUserIdRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`Record<string, unknown>`, required)

### `findWorkspaceUsers`

**Example:**

```typescript
    await client.users.findWorkspaceUsers({
        workspaceId: "64a687e29ae1f428e7ebe303",
        email: "<EMAIL>",
        "project-id": "21a687e29ae1f428e7ebe606",
        "account-statuses": "LIMITED",
        name: "John",
        "include-roles": true
    })
```

**Request fields** (`FindWorkspaceUsersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `email` (`string`, optional) — Filters users by email substring.
- `project-id` (`string`, optional) — If provided, returns users that have access to the project.
- `status` (`ClockifyApi.FindWorkspaceUsersRequestStatus`, optional) — Filters users with the corresponding status.
- `account-statuses` (`string`, optional) — Filters users with the corresponding account status filter.
- `name` (`string`, optional) — Filters users by name substring.
- `sort-column` (`ClockifyApi.FindWorkspaceUsersRequestSortColumn`, optional) — Sorting column criteria. Default value: EMAIL
- `sort-order` (`ClockifyApi.FindWorkspaceUsersRequestSortOrder`, optional) — Sorting mode. Default value: ASCENDING
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `memberships` (`ClockifyApi.FindWorkspaceUsersRequestMemberships`, optional) — If provided, returns users along with workspaces, groups, or projects they have access to. Default value is NONE.
- `include-roles` (`boolean`, required) — If true, each user's detailed manager roles are included.

### `filterWorkspaceUsers`

**Example:**

```typescript
    await client.users.filterWorkspaceUsers({
        workspaceId: "64a687e29ae1f428e7ebe303",
        accountStatuses: ["LIMITED", "ACTIVE"],
        email: "<EMAIL>",
        includeRoles: false,
        memberships: "NONE",
        name: "John",
        page: 1,
        pageSize: 50,
        projectId: "21a687e29ae1f428e7ebe606",
        roles: ["WORKSPACE_ADMIN", "OWNER"],
        sortColumn: "ID",
        sortOrder: "ASCENDING",
        status: "ACTIVE",
        userGroups: ["5a0ab5acb07987125438b60f", "72wab5acb07987125438b564"]
    })
```

**Request fields** (`UserFilterRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `accountStatuses` (`ClockifyApi.AccountStatus[]`, optional) — Filters users with the corresponding account status filter.
- `email` (`string`, optional) — Filters users by email substring.
- `includeRoles` (`boolean`, optional) — If true, each user's detailed manager roles are included.
- `memberships` (`UserFilterRequest.Memberships`, optional) — Returns users along with workspaces, groups, or projects they have access to.
- `name` (`string`, optional) — Filters users by name substring.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `projectId` (`string`, optional) — If provided, returns users that have access to the project.
- `roles` (`UserFilterRequest.Roles.Item[]`, optional) — Filters users that have any of the specified roles.
- `sortColumn` (`UserFilterRequest.SortColumn`, optional) — Sorting criteria.
- `sortOrder` (`UserFilterRequest.SortOrder`, optional) — Sorting mode.
- `status` (`UserFilterRequest.Status`, optional) — Filters users with the corresponding status.
- `userGroups` (`string[]`, optional) — Filters users that belong to the specified user group IDs.

### `updateUserCustomFieldValue`

**Example:**

```typescript
    await client.users.updateUserCustomFieldValue({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        customFieldId: "5e4117fe8c625f38930d57b7",
        value: "20231211-12345"
    })
```

**Request fields** (`UpdateUserCustomFieldValueRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `customFieldId` (`string`, required) — Represents a custom field identifier across the system.
- `value` (`unknown \| null`, required) — Represents custom field value.

### `findUserTeamManagers`

**Example:**

```typescript
    await client.users.findUserTeamManagers({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f"
    })
```

**Request fields** (`FindUserTeamManagersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `sort-column` (`ClockifyApi.FindUserTeamManagersRequestSortColumn`, optional) — Sorting column criteria.
- `sort-order` (`ClockifyApi.FindUserTeamManagersRequestSortOrder`, optional) — Sorting mode.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.

