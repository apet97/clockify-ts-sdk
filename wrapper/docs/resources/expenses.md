# expenses

6 methods on `client.expenses`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getWorkspaceExpenses`

**Example:**

```typescript
    await client.expenses.getWorkspaceExpenses({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspaceExpensesRequest`):

- `workspaceId` (`string`, required)

### `createExpense`

**Example:**

```typescript
    import { createReadStream } from "fs";
    await client.expenses.createExpense({
        file: fs.createReadStream("/path/to/your/file"),
        workspaceId: "workspaceId",
        amount: 1.1,
        categoryId: "categoryId",
        date: "2024-01-15T09:30:00Z",
        projectId: "projectId",
        userId: "userId"
    })
```

**Request fields** (`ExpenseCreateRequest`):

- `workspaceId` (`string`, required)
- `amount` (`number`, required)
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`core.file.Uploadable`, required)
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `getExpenseById`

**Example:**

```typescript
    await client.expenses.getExpenseById({
        workspaceId: "workspaceId",
        expenseId: "expenseId"
    })
```

**Request fields** (`GetExpenseByIdRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)

### `updateExpense`

**Example:**

```typescript
    import { createReadStream } from "fs";
    await client.expenses.updateExpense({
        file: fs.createReadStream("/path/to/your/file"),
        workspaceId: "workspaceId",
        expenseId: "expenseId",
        amount: 1.1,
        categoryId: "categoryId",
        changeFields: ["USER"],
        date: "2024-01-15T09:30:00Z",
        userId: "userId"
    })
```

**Request fields** (`ExpenseUpdateRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)
- `amount` (`number`, required) — Represents an expense amount as the double data type.
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `changeFields` (`ExpenseUpdateRequest.ChangeFields.Item[]`, required) — Represents a list of expense change fields.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`core.file.Uploadable`, required)
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional) — Represents a project identifier across the system.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `deleteExpense`

**Example:**

```typescript
    await client.expenses.deleteExpense({
        workspaceId: "workspaceId",
        expenseId: "expenseId"
    })
```

**Request fields** (`DeleteExpenseRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)

### `downloadExpenseReceipt`

**Request fields** (`DownloadExpenseReceiptRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)
- `fileId` (`string`, required)

