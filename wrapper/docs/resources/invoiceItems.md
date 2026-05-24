# invoiceItems

3 methods on `client.invoiceItems`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `create`

**Example:**

```typescript
    await client.invoiceItems.create({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        applyTaxes: "TAX1TAX2",
        description: "This is a description of an invoice item.",
        itemType: "Service",
        quantity: 10000,
        unitPrice: 500
    })
```

**Request fields** (`AddInvoiceItemRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `applyTaxes` (`ClockifyApi.ApplyTaxes`, required)
- `description` (`string`, required) — Represents an invoice item description.
- `itemType` (`string`, required) — Represents an item type.
- `quantity` (`number`, required) — Represents an item quantity.
- `unitPrice` (`number`, required) — Represents an item unit price.

### `import`

**Example:**

```typescript
    await client.invoiceItems.import({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        expenseFieldsForDetailedGroup: ["NOTE"],
        expensesGroupBy: "CATEGORY",
        expensesGroupType: "GROUPED",
        from: "2025-06-01T00:00:00Z",
        importExpenses: false,
        projectFilter: {
            contains: "CONTAINS",
            ids: ["25b687e29ae1f428e7ebe123"],
            status: "ACTIVE"
        },
        roundTimeEntryDuration: false,
        timeEntryFieldsForDetailedGroup: ["PROJECT", "DESCRIPTION"],
        timeEntryGroupType: "GROUPED",
        timeEntryPrimaryGroupBy: "PROJECT",
        timeEntrySecondaryGroupBy: "TASK",
        to: "2025-06-07T00:00:00Z"
    })
```

**Request fields** (`ImportInvoiceItemsRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
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

### `delete`

**Example:**

```typescript
    await client.invoiceItems.delete({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        order: "order"
    })
```

**Request fields** (`DeleteInvoiceItemsRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `order` (`string`, required)

