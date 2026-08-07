# expenses

6 methods on `client.expenses`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListExpensesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `user-id` (`string`, optional) — Filters expenses by the user ID linked to the expense.

### `create`

**Request fields** (`ExpenseCreateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `amount` (`number`, required)
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, optional) — Live Clockify accepts create-expense multipart requests without a file.
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional)
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
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

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `expenseId` (`string`, required) — Represents an expense identifier across the system.

### `update`

**Request fields** (`UpdateExpensesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `expenseId` (`string`, required) — Represents an expense identifier across the system.
- `amount` (`number`, required) — Represents an expense amount as the double data type.
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `changeFields` (`("USER" \| "DATE" \| "PROJECT" \| "TASK" \| "CATEGORY" \| "NOTES" \| "AMOUNT" \| "BILLABLE" \| "FILE")[]`, required) — Represents a list of expense change fields.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, optional)
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional) — Represents a project identifier across the system.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `expenseId` (`string`, required) — Represents an expense identifier across the system.
- `body` (`UpdateExpensesRequestBody`, required)
- `amount` (`number`, required) — Represents an expense amount as the double data type.
- `billable` (`boolean`, optional) — Indicates whether expense is billable or not.
- `categoryId` (`string`, required) — Represents a category identifier across the system.
- `changeFields` (`("USER" \| "DATE" \| "PROJECT" \| "TASK" \| "CATEGORY" \| "NOTES" \| "AMOUNT" \| "BILLABLE" \| "FILE")[]`, required) — Represents a list of expense change fields.
- `date` (`string`, required) — Provides a valid yyyy-MM-ddThh:mm:ssZ format date.
- `file` (`Blob \| File \| Buffer \| Uint8Array \| string`, optional)
- `notes` (`string`, optional) — Represents notes for an expense.
- `projectId` (`string`, optional) — Represents a project identifier across the system.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `delete`

**Request fields** (`DeleteExpensesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `expenseId` (`string`, required) — Represents an expense identifier across the system.

### `downloadReceipt`

**Request fields** (`DownloadReceiptExpensesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `expenseId` (`string`, required) — Represents an expense identifier across the system.
- `fileId` (`string`, required) — Represents a file identifier across the system.

