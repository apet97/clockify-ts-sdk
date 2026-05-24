# userGroups

8 methods on `client.userGroups`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.userGroups.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Example:**

```typescript
    await client.userGroups.create({
        workspaceId: "workspaceId",
        body: {
            name: "development_team"
        }
    })
```

**Request fields** (`CreateUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.UserGroupRequest`, required)

### `get`

**Example:**

```typescript
    await client.userGroups.get({
        workspaceId: "workspaceId",
        groupId: "groupId"
    })
```

**Request fields** (`GetUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.userGroups.update({
        workspaceId: "workspaceId",
        groupId: "groupId",
        body: {
            name: "development_team"
        }
    })
```

**Request fields** (`UpdateUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `body` (`ClockifyApi.UserGroupRequest`, required)

### `delete`

**Example:**

```typescript
    await client.userGroups.delete({
        workspaceId: "workspaceId",
        groupId: "groupId"
    })
```

**Request fields** (`DeleteUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)

### `listMembers`

**Example:**

```typescript
    await client.userGroups.listMembers({
        workspaceId: "workspaceId",
        groupId: "groupId"
    })
```

**Request fields** (`ListMembersUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)

### `addMembers`

**Example:**

```typescript
    await client.userGroups.addMembers({
        workspaceId: "workspaceId",
        groupId: "groupId",
        userId: "5a0ab5acb07987125438b60f"
    })
```

**Request fields** (`AddUserToGroupRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.

### `removeMember`

**Example:**

```typescript
    await client.userGroups.removeMember({
        workspaceId: "workspaceId",
        groupId: "groupId",
        userId: "userId"
    })
```

**Request fields** (`RemoveMemberUserGroupsRequest`):

- `workspaceId` (`string`, required)
- `groupId` (`string`, required)
- `userId` (`string`, required)

