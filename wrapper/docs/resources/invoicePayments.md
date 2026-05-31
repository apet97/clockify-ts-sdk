# invoicePayments

3 methods on `client.invoicePayments`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Request fields** (`ListInvoicePaymentsRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Request fields** (`AddInvoicePaymentRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `amount` (`number`, required) — Represents an invoice payment amount as long.
- `note` (`string`, optional) — Represents an invoice payment note.
- `paymentDate` (`string`, optional) — Represents an invoice payment date in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `body` (`AddInvoicePaymentRequestBody`, required)
- `amount` (`number`, required) — Represents an invoice payment amount as long.
- `note` (`string`, optional) — Represents an invoice payment note.
- `paymentDate` (`string`, optional) — Represents an invoice payment date in yyyy-MM-ddThh:mm:ssZ format.

### `delete`

**Request fields** (`DeleteInvoicePaymentsRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `paymentId` (`string`, required)

