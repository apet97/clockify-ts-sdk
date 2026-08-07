# expenseCategories

5 methods on `client.expenseCategories`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListExpenseCategoriesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `sort-column` (`"NAME"`, optional) — Column name to be used as sorting criteria.
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional) — Sorting order.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `archived` (`boolean`, optional) — Filters results based on whether the category is archived.
- `name` (`string`, optional) — Filters expense categories by a string matched against their name.

### `create`

**Request fields** (`ExpenseCategoryRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ExpenseCategoryRequestBody`, required)
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.

### `update`

**Request fields** (`UpdateExpenseCategoriesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `body` (`UpdateExpenseCategoriesRequestBody`, required)
- `hasUnitPrice` (`boolean`, optional) — Flag whether expense category has unit price or none.
- `name` (`string`, required) — Represents a valid expense category name.
- `priceInCents` (`number`, optional) — Represents price in cents as integer.
- `unit` (`string`, optional) — Represents a valid expense category unit.

### `delete`

**Request fields** (`DeleteExpenseCategoriesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `categoryId` (`string`, required) — Represents a category identifier across the system.

### `archive`

**Request fields** (`ArchiveExpenseCategoriesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `archived` (`boolean`, required) — Flag whether to archive the expense category or not.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `body` (`ArchiveExpenseCategoriesRequestBody`, required)
- `archived` (`boolean`, required) — Flag whether to archive the expense category or not.

