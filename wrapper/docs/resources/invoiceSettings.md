# invoiceSettings

2 methods on `client.invoiceSettings`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getInvoiceSettings`

**Example:**

```typescript
    await client.invoiceSettings.getInvoiceSettings({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetInvoiceSettingsRequest`):

- `workspaceId` (`string`, required)

### `updateInvoiceSettings`

**Example:**

```typescript
    await client.invoiceSettings.updateInvoiceSettings({
        workspaceId: "workspaceId",
        defaults: {
            notes: "notes",
            subject: "subject"
        },
        labels: {
            amount: "amount",
            billFrom: "billFrom",
            billTo: "billTo",
            description: "description",
            discount: "discount",
            dueDate: "dueDate",
            issueDate: "issueDate",
            itemType: "itemType",
            notes: "notes",
            paid: "paid",
            quantity: "quantity",
            subtotal: "subtotal",
            tax: "tax",
            tax2: "tax2",
            total: "total",
            totalAmountDue: "totalAmountDue",
            unitPrice: "unitPrice"
        }
    })
```

**Request fields** (`InvoiceSettingsRequest`):

- `workspaceId` (`string`, required)
- `defaults` (`ClockifyApi.InvoiceDefaultSettingsRequestV1`, optional)
- `exportFields` (`ClockifyApi.InvoiceExportFieldsRequest`, optional)
- `labels` (`ClockifyApi.LabelsCustomizationRequest`, required)

