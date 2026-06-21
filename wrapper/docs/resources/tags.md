# tags

5 methods on `client.tags`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListTagsRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, optional)
- `archived` (`boolean`, optional)
- `sort-column` (`"NAME"`, optional)
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `create`

**Request fields** (`TagCreate`):

- `workspaceId` (`string`, required)
- `name` (`string`, required)
- `workspaceId` (`string`, required)
- `body` (`TagCreateBody`, required)
- `name` (`string`, required)

### `get`

**Request fields** (`GetTagsRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)

### `update`

**Request fields** (`UpdateTagsRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)
- `archived` (`boolean`, optional)
- `name` (`string`, optional)
- `workspaceId` (`string`, required)
- `tagId` (`string`, required)
- `body` (`UpdateTagsRequestBody`, required)
- `archived` (`boolean`, optional)
- `name` (`string`, optional)

### `delete`

**Request fields** (`DeleteTagsRequest`):

- `workspaceId` (`string`, required)
- `tagId` (`string`, required)

