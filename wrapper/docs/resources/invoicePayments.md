# invoicePayments

3 methods on `client.invoicePayments`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListInvoicePaymentsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.

### `create`

**Request fields** (`AddInvoicePaymentRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `amount` (`number`, required) — Represents an invoice payment amount as long.
- `note` (`string`, optional) — Represents an invoice payment note.
- `paymentDate` (`string`, optional) — Represents an invoice payment date in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `body` (`AddInvoicePaymentRequestBody`, required)
- `amount` (`number`, required) — Represents an invoice payment amount as long.
- `note` (`string`, optional) — Represents an invoice payment note.
- `paymentDate` (`string`, optional) — Represents an invoice payment date in yyyy-MM-ddThh:mm:ssZ format.

### `delete`

**Request fields** (`DeleteInvoicePaymentsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `invoiceId` (`string`, required) — Represents an invoice identifier across the system.
- `paymentId` (`string`, required) — Represents a payment identifier across the system.

