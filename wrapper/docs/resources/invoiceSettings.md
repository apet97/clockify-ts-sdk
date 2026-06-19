# invoiceSettings

2 methods on `client.invoiceSettings`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `get`

**Request fields** (`GetInvoiceSettingsRequest`):

- `workspaceId` (`string`, required)

### `update`

**Request fields** (`UpdateInvoiceSettingsRequest`):

- `workspaceId` (`string`, required)
- `defaults` (`ClockifyApi.InvoiceDefaultSettingsRequestV1`, optional)
- `exportFields` (`ClockifyApi.InvoiceExportFieldsRequest`, optional)
- `labels` (`ClockifyApi.LabelsCustomizationRequest`, required)
- `workspaceId` (`string`, required)
- `body` (`UpdateInvoiceSettingsRequestBody`, required)
- `defaults` (`ClockifyApi.InvoiceDefaultSettingsRequestV1`, optional)
- `exportFields` (`ClockifyApi.InvoiceExportFieldsRequest`, optional)
- `labels` (`ClockifyApi.LabelsCustomizationRequest`, required)

