# invoicePayments

3 methods on `client.invoicePayments`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getInvoicePayments`

**Example:**

```typescript
    await client.invoicePayments.getInvoicePayments({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId"
    })
```

**Request fields** (`GetInvoicePaymentsRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `addInvoicePayment`

**Example:**

```typescript
    await client.invoicePayments.addInvoicePayment({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        amount: 100,
        note: "This is a sample note for this invoice payment.",
        paymentDate: "2021-01-01T12:00:00Z"
    })
```

**Request fields** (`AddInvoicePaymentRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `amount` (`number`, required) — Represents an invoice payment amount as long.
- `note` (`string`, optional) — Represents an invoice payment note.
- `paymentDate` (`string`, optional) — Represents an invoice payment date in yyyy-MM-ddThh:mm:ssZ format.

### `deleteInvoicePayment`

**Example:**

```typescript
    await client.invoicePayments.deleteInvoicePayment({
        workspaceId: "workspaceId",
        invoiceId: "invoiceId",
        paymentId: "paymentId"
    })
```

**Request fields** (`DeleteInvoicePaymentRequest`):

- `workspaceId` (`string`, required)
- `invoiceId` (`string`, required)
- `paymentId` (`string`, required)

