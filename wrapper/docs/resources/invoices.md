# invoices

9 methods on `client.invoices`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListInvoicesRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Request fields** (`InvoiceCreateRequest`):

- `workspaceId` (`string`, required)
- `clientId` (`string`, required) — Represents a client identifier across the system.
- `currency` (`string`, required) — Represents the currency used by the invoice.
- `dueDate` (`string`, required) — Represents an invoice due date in yyyy-MM-ddThh:mm:ssZ format.
- `issuedDate` (`string`, required) — Represents an invoice issued date in yyyy-MM-ddThh:mm:ssZ format.
- `number` (`string`, required) — Represents an invoice number.
- `timeViewMode` (`ClockifyApi.TimeViewMode`, optional)
- `workspaceId` (`string`, required)
- `body` (`InvoiceCreateRequestBody`, required)
- `clientId` (`string`, required) — Represents a client identifier across the system.
- `currency` (`string`, required) — Represents the currency used by the invoice.
- `dueDate` (`string`, required) — Represents an invoice due date in yyyy-MM-ddThh:mm:ssZ format.
- `issuedDate` (`string`, required) — Represents an invoice issued date in yyyy-MM-ddThh:mm:ssZ format.
- `number` (`string`, required) — Represents an invoice number.
- `timeViewMode` (`ClockifyApi.TimeViewMode`, optional)

### `get`

**Request fields** (`GetInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)

### `update`

**Request fields** (`UpdateInvoicesRequest`):

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
- `visibleZeroFields` (`ClockifyApi.VisibleZeroFieldsInvoice \| ClockifyApi.VisibleZeroFieldsInvoice[]`, optional) — Represents one or more zero value invoice fields that will be visible.
- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `body` (`UpdateInvoicesRequestBody`, required)
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
- `visibleZeroFields` (`ClockifyApi.VisibleZeroFieldsInvoice \| ClockifyApi.VisibleZeroFieldsInvoice[]`, optional) — Represents one or more zero value invoice fields that will be visible.

### `delete`

**Request fields** (`DeleteInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)

### `duplicate`

**Request fields** (`DuplicateInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)

### `export`

**Request fields** (`ExportInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `userLocale` (`string`, required) — Required by live Clockify invoice export; the MCP defaults it to en-US.

### `updateStatus`

**Request fields** (`UpdateStatusInvoicesRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `invoiceStatus` (`ClockifyApi.InvoiceStatus`, required)
- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `body` (`UpdateStatusInvoicesRequestBody`, required)
- `invoiceStatus` (`ClockifyApi.InvoiceStatus`, required)

### `filter`

**Request fields** (`FilterInvoicesRequest`):

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
- `workspaceId` (`string`, required)
- `body` (`FilterInvoicesRequestBody`, required)
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

