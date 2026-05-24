# tags

5 methods on `client.tags`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getWorkspacesWorkspaceIdTags`

**Example:**

```typescript
    await client.tags.getWorkspacesWorkspaceIdTags({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdTagsRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, optional)
- `archived` (`boolean`, optional)
- `sort-column` (`ClockifyApi.GetWorkspacesWorkspaceIdTagsRequestSortColumn`, optional)
- `sort-order` (`ClockifyApi.GetWorkspacesWorkspaceIdTagsRequestSortOrder`, optional)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `postWorkspacesWorkspaceIdTags`

**Example:**

```typescript
    await client.tags.postWorkspacesWorkspaceIdTags({
        workspaceId: "workspaceId",
        name: "name"
    })
```

**Request fields** (`TagCreate`):

- `workspaceId` (`string`, required)
- `name` (`string`, required)

### `getWorkspacesWorkspaceIdTagsTagId`

**Example:**

```typescript
    await client.tags.getWorkspacesWorkspaceIdTagsTagId({
        workspaceId: "workspaceId",
        tagId: "tagId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdTagsTagIdRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)

### `putWorkspacesWorkspaceIdTagsTagId`

**Example:**

```typescript
    await client.tags.putWorkspacesWorkspaceIdTagsTagId({
        workspaceId: "workspaceId",
        tagId: "tagId"
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdTagsTagIdRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)
- `archived` (`boolean`, optional)
- `name` (`string`, optional)

### `deleteWorkspacesWorkspaceIdTagsTagId`

**Example:**

```typescript
    await client.tags.deleteWorkspacesWorkspaceIdTagsTagId({
        workspaceId: "workspaceId",
        tagId: "tagId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdTagsTagIdRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)

