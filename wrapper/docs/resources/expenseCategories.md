# expenseCategories

5 methods on `client.expenseCategories`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Request fields** (`ExpenseCategoryRequest`):

- `workspaceId` (`string`, required)
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.
- `workspaceId` (`string`, required)
- `body` (`ExpenseCategoryRequestBody`, required)
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.

### `update`

**Request fields** (`UpdateExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.
- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `body` (`UpdateExpenseCategoriesRequestBody`, required)
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.

### `delete`

**Request fields** (`DeleteExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)

### `archive`

**Request fields** (`ArchiveExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `archived` (`boolean`, required) — Flag whether to archive the expense category or not.
- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `body` (`ArchiveExpenseCategoriesRequestBody`, required)
- `archived` (`boolean`, required) — Flag whether to archive the expense category or not.

