# expenses

6 methods on `client.expenses`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Request fields** (`ListExpensesRequest`):

- `workspaceId` (`string`, required)

### `create`

**Request fields** (`ExpenseCreateRequest`):

- `workspaceId` (`string`, required)
- `amount` (`number`, required)
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, optional) — Live Clockify accepts create-expense multipart requests without a file.
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional)
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required)
- `body` (`ExpenseCreateRequestBody`, required)
- `amount` (`number`, required)
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, optional) — Live Clockify accepts create-expense multipart requests without a file.
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional)
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `get`

**Request fields** (`GetExpensesRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)

### `update`

**Request fields** (`UpdateExpensesRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)
- `amount` (`number`, required) — Represents an expense amount as the double data type.
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `changeFields` (`"USER" \| "DATE" \| "PROJECT" \| "TASK" \| "CATEGORY" \| "NOTES" \| "AMOUNT" \| "BILLABLE" \| "FILE"[]`, required) — Represents a list of expense change fields.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, required)
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional) — Represents a project identifier across the system.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)
- `body` (`UpdateExpensesRequestBody`, required)
- `amount` (`number`, required) — Represents an expense amount as the double data type.
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `changeFields` (`"USER" \| "DATE" \| "PROJECT" \| "TASK" \| "CATEGORY" \| "NOTES" \| "AMOUNT" \| "BILLABLE" \| "FILE"[]`, required) — Represents a list of expense change fields.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, required)
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional) — Represents a project identifier across the system.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `delete`

**Request fields** (`DeleteExpensesRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)

### `downloadReceipt`

**Request fields** (`DownloadReceiptExpensesRequest`):

- `workspaceId` (`string`, required)
- `expenseId` (`string`, required)
- `fileId` (`string`, required)

