# invoiceItems

3 methods on `client.invoiceItems`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `create`

**Request fields** (`AddInvoiceItemRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `applyTaxes` (`ClockifyApi.ApplyTaxes`, required)
- `description` (`string`, required) — Represents an invoice item description.
- `itemType` (`string`, required) — Represents an item type.
- `quantity` (`number`, required) — Represents an item quantity.
- `unitPrice` (`number`, required) — Represents an item unit price.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `body` (`AddInvoiceItemRequestBody`, required)
- `applyTaxes` (`ClockifyApi.ApplyTaxes`, required)
- `description` (`string`, required) — Represents an invoice item description.
- `itemType` (`string`, required) — Represents an item type.
- `quantity` (`number`, required) — Represents an item quantity.
- `unitPrice` (`number`, required) — Represents an item unit price.

### `delete`

**Request fields** (`DeleteInvoiceItemsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `order` (`number`, required) — Represents an invoice item order.

### `import`

**Request fields** (`ImportInvoiceItemsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `expenseFieldsForDetailedGroup` (`ClockifyApi.ExpenseFieldsForDetailedGroup[]`, optional) — A set of expense fields to include when using the DETAILED expense grouping type.
- `expensesGroupBy` (`ClockifyApi.ExpensesGroupBy`, optional) — Represents a group field when using the GROUPED expense group type.
- `expensesGroupType` (`ClockifyApi.ExpensesGroupType`, optional) — Represents an expense group type.
- `from` (`string`, required) — Represents date and time in the yyyy-MM-ddThh:mm:ssZ format.
- `importExpenses` (`boolean`, required) — Indicates if billable expenses should be imported alongside time entries.
- `projectFilter` (`ClockifyApi.ContainsArchivedFilterRequest`, required)
- `roundTimeEntryDuration` (`boolean`, optional) — Indicates if imported time entry durations should be rounded to the nearest 15 minute interval.
- `timeEntryFieldsForDetailedGroup` (`ClockifyApi.TimeEntryFieldsForDetailedGroup[]`, optional) — A set of time entry fields to include when using DETAILED time entry grouping type.
- `timeEntryGroupType` (`ClockifyApi.TimeEntryGroupType`, required)
- `timeEntryPrimaryGroupBy` (`ClockifyApi.TimeEntryPrimaryGroupBy`, optional)
- `timeEntrySecondaryGroupBy` (`ClockifyApi.TimeEntrySecondaryGroupBy`, optional)
- `to` (`string`, required) — Represents date and time in the yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `body` (`ImportInvoiceItemsRequestBody`, required)
- `expenseFieldsForDetailedGroup` (`ClockifyApi.ExpenseFieldsForDetailedGroup[]`, optional) — A set of expense fields to include when using the DETAILED expense grouping type.
- `expensesGroupBy` (`ClockifyApi.ExpensesGroupBy`, optional) — Represents a group field when using the GROUPED expense group type.
- `expensesGroupType` (`ClockifyApi.ExpensesGroupType`, optional) — Represents an expense group type.
- `from` (`string`, required) — Represents date and time in the yyyy-MM-ddThh:mm:ssZ format.
- `importExpenses` (`boolean`, required) — Indicates if billable expenses should be imported alongside time entries.
- `projectFilter` (`ClockifyApi.ContainsArchivedFilterRequest`, required)
- `roundTimeEntryDuration` (`boolean`, optional) — Indicates if imported time entry durations should be rounded to the nearest 15 minute interval.
- `timeEntryFieldsForDetailedGroup` (`ClockifyApi.TimeEntryFieldsForDetailedGroup[]`, optional) — A set of time entry fields to include when using DETAILED time entry grouping type.
- `timeEntryGroupType` (`ClockifyApi.TimeEntryGroupType`, required)
- `timeEntryPrimaryGroupBy` (`ClockifyApi.TimeEntryPrimaryGroupBy`, optional)
- `timeEntrySecondaryGroupBy` (`ClockifyApi.TimeEntrySecondaryGroupBy`, optional)
- `to` (`string`, required) — Represents date and time in the yyyy-MM-ddThh:mm:ssZ format.

