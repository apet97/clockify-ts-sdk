# tags

5 methods on `client.tags`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.tags.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListTagsRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, optional)
- `archived` (`boolean`, optional)
- `sort-column` (`ClockifyApi.ListTagsRequestSortColumn`, optional)
- `sort-order` (`ClockifyApi.ListTagsRequestSortOrder`, optional)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Example:**

```typescript
    await client.tags.create({
        workspaceId: "workspaceId",
        name: "name"
    })
```

**Request fields** (`TagCreate`):

- `workspaceId` (`string`, required)
- `name` (`string`, required)

### `get`

**Example:**

```typescript
    await client.tags.get({
        workspaceId: "workspaceId",
        tagId: "tagId"
    })
```

**Request fields** (`GetTagsRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.tags.update({
        workspaceId: "workspaceId",
        tagId: "tagId"
    })
```

**Request fields** (`UpdateTagsRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)
- `archived` (`boolean`, optional)
- `name` (`string`, optional)

### `delete`

**Example:**

```typescript
    await client.tags.delete({
        workspaceId: "workspaceId",
        tagId: "tagId"
    })
```

**Request fields** (`DeleteTagsRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)

