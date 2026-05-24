# invoices

9 methods on `client.invoices`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.invoices.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListInvoicesRequest`):

- `workspaceId` (`string`, required)

### `create`

**Example:**

```typescript
    await client.invoices.create({
        workspaceId: "workspaceId",
        clientId: "34p687e29ae1f428e7ebe562",
        currency: "USD",
        dueDate: "2020-06-01T08:00:00Z",
        issuedDate: "2020-01-01T08:00:00Z",
        number: "202306121129",
        timeViewMode: "AGGREGATED_TIME_VIEW"
    })
```

**Request fields** (`InvoiceCreateRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required) — Represents a client identifier across the system.
- `currency` (`string`, required) — Represents the currency used by the invoice.
- `dueDate` (`string`, required) — Represents an invoice due date in yyyy-MM-ddThh:mm:ssZ format.
- `issuedDate` (`string`, required) — Represents an invoice issued date in yyyy-MM-ddThh:mm:ssZ format.
- `number` (`string`, required) — Represents an invoice number.
- `timeViewMode` (`ClockifyApi.TimeViewMode`, optional)

### `filter`

**Example:**

```typescript
    await client.invoices.filter({
        workspaceId: "workspaceId",
        clients: {
            contains: "CONTAINS",
            ids: ["44a687e29ae1f428e7ebe305"],
            status: "ACTIVE"
        },
        companies: {
            contains: "CONTAINS",
            ids: ["04g687e29ae1f428e7ebe123"]
        },
        exactAmount: 1000,
        exactBalance: 1000,
        greaterThanAmount: 500,
        greaterThanBalance: 500,
        invoiceNumber: "Invoice-01",
        issueDate: {
            "issue-date-end": "2024-12-31",
            "issue-date-start": "2024-01-01"
        },
        lessThanAmount: 500,
        lessThanBalance: 500,
        page: 1,
        pageSize: 50,
        sortColumn: "ID",
        sortOrder: "ASCENDING",
        statuses: ["SENT", "PAID", "PARTIALLY_PAID"],
        strictSearch: false
    })
```

**Request fields** (`InvoiceFilterRequest`):

- `workspaceId` (`string`, required)
- `clients` (`ClockifyApi.ContainsArchivedFilterRequest`, optional)
- `companies` (`ClockifyApi.BaseFilterRequest`, optional)
- `exactAmount` (`number`, optional) — If provided, filters invoices with the exact amount.
- `exactBalance` (`number`, optional) — If provided, filters invoices with the exact balance.
- `greaterThanAmount` (`number`, optional) — If provided, filters invoices with amount greater than specified.
- `greaterThanBalance` (`number`, optional) — If provided, filters invoices with balance greater than specified.
- `invoiceNumber` (`string`, optional) — If provided, filters invoices that contain the provided string in their invoice number.
- `issueDate` (`ClockifyApi.TimeRangeRequestDtoV1`, optional)
- `lessThanAmount` (`number`, optional) — If provided, filters invoices with amount less than specified.
- `lessThanBalance` (`number`, optional) — If provided, filters invoices with balance less than specified.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `sortColumn` (`ClockifyApi.InvoiceSortColumn`, optional)
- `sortOrder` (`ClockifyApi.InvoicesSortOrder`, optional)
- `statuses` (`ClockifyApi.InvoiceStatus[]`, optional) — Represents a list of invoice statuses.
- `strictSearch` (`boolean`, optional) — When true, search by invoice number only returns invoices whose number exactly matches the provided string.

### `get`

**Example:**

```typescript
    await client.invoices.get({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId"
    })
```

**Request fields** (`GetInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.invoices.update({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        clientId: "98h687e29ae1f428e7ebe707",
        companyId: "04g687e29ae1f428e7ebe123",
        currency: "USD",
        discountPercent: 10.5,
        dueDate: "2020-06-01T08:00:00Z",
        issuedDate: "2020-01-01T08:00:00Z",
        note: "This is a sample note for this invoice.",
        number: "202306121129",
        subject: "January salary",
        tax2Percent: 0,
        taxPercent: 1.5,
        taxType: "SIMPLE",
        visibleZeroFields: ["TAX", "TAX_2", "DISCOUNT"]
    })
```

**Request fields** (`UpdateInvoiceRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `clientId` (`string`, optional) — Represents client identifier across the system.
- `companyId` (`string`, optional) — Represents company identifier across the system.
- `currency` (`string`, required) — Represents the currency used by the invoice.
- `discountPercent` (`number`, required) — Represents an invoice discount percent as double.
- `dueDate` (`string`, required) — Represents an invoice due date in yyyy-MM-ddThh:mm:ssZ format.
- `issuedDate` (`string`, required) — Represents an invoice issued date in yyyy-MM-ddThh:mm:ssZ format.
- `note` (`string`, optional) — Represents an invoice note.
- `number` (`string`, required) — Represents an invoice number.
- `subject` (`string`, optional) — Represents an invoice subject.
- `tax2Percent` (`number`, required) — Represents an invoice tax 2 percent as double.
- `taxPercent` (`number`, required) — Represents an invoice tax percent as double.
- `taxType` (`ClockifyApi.TaxType`, optional)
- `visibleZeroFields` (`UpdateInvoiceRequest.VisibleZeroFields`, optional) — Represents one or more zero value invoice fields that will be visible.

### `delete`

**Example:**

```typescript
    await client.invoices.delete({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId"
    })
```

**Request fields** (`DeleteInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)

### `duplicate`

**Example:**

```typescript
    await client.invoices.duplicate({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId"
    })
```

**Request fields** (`DuplicateInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)

### `export`

**Request fields** (`ExportInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `userLocale` (`string`, required) — Required by live Clockify invoice export; the MCP defaults it to en-US.

### `updateStatus`

**Example:**

```typescript
    await client.invoices.updateStatus({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        invoiceStatus: "PAID"
    })
```

**Request fields** (`InvoiceStatusRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `invoiceStatus` (`ClockifyApi.InvoiceStatus`, required)

