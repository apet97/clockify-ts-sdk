# invoiceSettings

2 methods on `client.invoiceSettings`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `get`

**Request fields** (`GetInvoiceSettingsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.

### `update`

**Request fields** (`UpdateInvoiceSettingsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `defaults` (`ClockifyApi.InvoiceDefaultSettingsRequestV1`, optional)
- `exportFields` (`ClockifyApi.InvoiceExportFieldsRequest`, optional)
- `labels` (`ClockifyApi.LabelsCustomizationRequest`, required)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`UpdateInvoiceSettingsRequestBody`, required)
- `defaults` (`ClockifyApi.InvoiceDefaultSettingsRequestV1`, optional)
- `exportFields` (`ClockifyApi.InvoiceExportFieldsRequest`, optional)
- `labels` (`ClockifyApi.LabelsCustomizationRequest`, required)

