# expenseCategories

5 methods on `client.expenseCategories`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getExpenseCategories`

**Example:**

```typescript
    await client.expenseCategories.getExpenseCategories({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetExpenseCategoriesRequest`):

- `workspaceId` (`string`, required)

### `addExpenseCategory`

**Example:**

```typescript
    await client.expenseCategories.addExpenseCategory({
        workspaceId: "workspaceId",
        body: {
            hasUnitPrice: false,
            name: "Procurement",
            priceInCents: 1000,
            unit: "piece"
        }
    })
```

**Request fields** (`AddExpenseCategoryRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.ExpenseCategoryRequest`, required)

### `updateExpenseCategory`

**Example:**

```typescript
    await client.expenseCategories.updateExpenseCategory({
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

**Request fields** (`UpdateExpenseCategoryRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `body` (`ClockifyApi.ExpenseCategoryRequest`, required)

### `deleteExpenseCategory`

**Example:**

```typescript
    await client.expenseCategories.deleteExpenseCategory({
        workspaceId: "workspaceId",
        categoryId: "categoryId"
    })
```

**Request fields** (`DeleteExpenseCategoryRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)

### `archiveExpenseCategory`

**Example:**

```typescript
    await client.expenseCategories.archiveExpenseCategory({
        workspaceId: "workspaceId",
        categoryId: "categoryId",
        archived: false
    })
```

**Request fields** (`ExpenseCategoryStatusRequest`):

- `workspaceId` (`string`, required)
- `categoryId` (`string`, required)
- `archived` (`boolean`, required) — Flag whether to archive the expense category or not.

