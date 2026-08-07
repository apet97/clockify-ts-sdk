# invoices

9 methods on `client.invoices`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `statuses` (`ClockifyApi.InvoiceStatus[]`, optional) — Filter invoices by one or more invoice statuses.
- `sort-column` (`ClockifyApi.InvoiceSortColumn`, optional) — Valid column name as sorting criteria. Default: ID.
- `sort-order` (`ClockifyApi.InvoicesSortOrder`, optional) — Sort order. Default: ASCENDING.

### `create`

**Request fields** (`InvoiceCreateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `clientId` (`string`, required) — Represents a client identifier across the system.
- `currency` (`string`, required) — Represents the currency used by the invoice.
- `dueDate` (`string`, required) — Represents an invoice due date in yyyy-MM-ddThh:mm:ssZ format.
- `issuedDate` (`string`, required) — Represents an invoice issued date in yyyy-MM-ddThh:mm:ssZ format.
- `number` (`string`, required) — Represents an invoice number.
- `timeViewMode` (`ClockifyApi.TimeViewMode`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`InvoiceCreateRequestBody`, required)
- `clientId` (`string`, required) — Represents a client identifier across the system.
- `currency` (`string`, required) — Represents the currency used by the invoice.
- `dueDate` (`string`, required) — Represents an invoice due date in yyyy-MM-ddThh:mm:ssZ format.
- `issuedDate` (`string`, required) — Represents an invoice issued date in yyyy-MM-ddThh:mm:ssZ format.
- `number` (`string`, required) — Represents an invoice number.
- `timeViewMode` (`ClockifyApi.TimeViewMode`, optional)

### `get`

**Request fields** (`GetInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.

### `update`

**Request fields** (`UpdateInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `billFrom` (`string`, optional) — Represents to whom the invoice should be billed from.
- `clientAddress` (`string`, optional) — Represents client address.
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
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `body` (`UpdateInvoicesRequestBody`, required)
- `billFrom` (`string`, optional) — Represents to whom the invoice should be billed from.
- `clientAddress` (`string`, optional) — Represents client address.
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

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.

### `duplicate`

**Request fields** (`DuplicateInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.

### `export`

**Request fields** (`ExportInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `userLocale` (`string`, required) — Required by live Clockify invoice export; the MCP defaults it to en-US.

### `updateStatus`

**Request fields** (`UpdateStatusInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `invoiceStatus` (`ClockifyApi.InvoiceStatus`, required)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `body` (`UpdateStatusInvoicesRequestBody`, required)
- `invoiceStatus` (`ClockifyApi.InvoiceStatus`, required)

### `filter`

**Request fields** (`FilterInvoicesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
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
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
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

