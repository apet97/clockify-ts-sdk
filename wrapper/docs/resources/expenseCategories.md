# expenseCategories

5 methods on `client.expenseCategories`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.expenseCategories.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)

### `create`

**Example:**

```typescript
    await client.expenseCategories.create({
        workspaceId: "workspaceId",
        body: {
            hasUnitPrice: false,
            name: "Procurement",
            priceInCents: 1000,
            unit: "piece"
        }
    })
```

**Request fields** (`CreateExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.ExpenseCategoryRequest`, required)

### `update`

**Example:**

```typescript
    await client.expenseCategories.update({
        workspaceId: "workspaceId",
        categoryId: "categoryId",
        body: {
            hasUnitPrice: false,
            name: "Procurement",
            priceInCents: 1000,
            unit: "piece"
        }
    })
```

**Request fields** (`UpdateExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `body` (`ClockifyApi.ExpenseCategoryRequest`, required)

### `delete`

**Example:**

```typescript
    await client.expenseCategories.delete({
        workspaceId: "workspaceId",
        categoryId: "categoryId"
    })
```

**Request fields** (`DeleteExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)

### `archive`

**Example:**

```typescript
    await client.expenseCategories.archive({
        workspaceId: "workspaceId",
        categoryId: "categoryId",
        archived: false
    })
```

**Request fields** (`ExpenseCategoryStatusRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `archived` (`boolean`, required) — Flag whether to archive the expense category or not.

