# sharedReports

5 methods on `client.sharedReports`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `view`

**Request fields** (`ViewSharedReportsRequest`):

- `sharedReportId` (`string`, required)
- `exportType` (`"JSON_V1" \| "JSON" \| "CSV" \| "XLSX" \| "PDF"`, optional)

### `list`

**Request fields** (`ListSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional)
- `pageSize` (`number`, optional)

### `create`

**Request fields** (`SharedReportCreate`):

- `workspaceId` (`string`, required)
- `filter` (`ClockifyApi.SharedReportFilter`, required)
- `isPublic` (`boolean`, optional)
- `name` (`string`, required)
- `type` (`"SUMMARY" \| "DETAILED" \| "WEEKLY" \| "EXPENSE_DETAILED" \| "INVOICE_TIME" \| "KIOSK_PIN_LIST" \| "ATTENDANCE_DETAILED" \| "ATTENDANCE_SUMMARY" \| "ASSIGNMENT_LIST" \| "ASSIGNMENT_SCHEDULE" \| "APPROVAL_DETAILED" \| "APPROVAL_SUMMARY" \| "BALANCE_LIST" \| "INVOICE_AMOUNT_LIST" \| "INVOICE_DETAILED" \| "TIMEOFF_DETAILED" \| "TIMEOFF_HOLIDAY" \| "TIMEOFF_BALANCE" \| "EXPENSE_SUMMARY"`, required)
- `workspaceId` (`string`, required)
- `body` (`SharedReportCreateBody`, required)
- `filter` (`ClockifyApi.SharedReportFilter`, required)
- `isPublic` (`boolean`, optional)
- `name` (`string`, required)
- `type` (`"SUMMARY" \| "DETAILED" \| "WEEKLY" \| "EXPENSE_DETAILED" \| "INVOICE_TIME" \| "KIOSK_PIN_LIST" \| "ATTENDANCE_DETAILED" \| "ATTENDANCE_SUMMARY" \| "ASSIGNMENT_LIST" \| "ASSIGNMENT_SCHEDULE" \| "APPROVAL_DETAILED" \| "APPROVAL_SUMMARY" \| "BALANCE_LIST" \| "INVOICE_AMOUNT_LIST" \| "INVOICE_DETAILED" \| "TIMEOFF_DETAILED" \| "TIMEOFF_HOLIDAY" \| "TIMEOFF_BALANCE" \| "EXPENSE_SUMMARY"`, required)

### `update`

**Request fields** (`UpdateSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)
- `filter` (`ClockifyApi.SharedReportFilter`, required)
- `isPublic` (`boolean`, optional)
- `name` (`string`, required)
- `type` (`"SUMMARY" \| "DETAILED" \| "WEEKLY" \| "EXPENSE_DETAILED" \| "INVOICE_TIME" \| "KIOSK_PIN_LIST" \| "ATTENDANCE_DETAILED" \| "ATTENDANCE_SUMMARY" \| "ASSIGNMENT_LIST" \| "ASSIGNMENT_SCHEDULE" \| "APPROVAL_DETAILED" \| "APPROVAL_SUMMARY" \| "BALANCE_LIST" \| "INVOICE_AMOUNT_LIST" \| "INVOICE_DETAILED" \| "TIMEOFF_DETAILED" \| "TIMEOFF_HOLIDAY" \| "TIMEOFF_BALANCE" \| "EXPENSE_SUMMARY"`, required)
- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)
- `body` (`UpdateSharedReportsRequestBody`, required)
- `filter` (`ClockifyApi.SharedReportFilter`, required)
- `isPublic` (`boolean`, optional)
- `name` (`string`, required)
- `type` (`"SUMMARY" \| "DETAILED" \| "WEEKLY" \| "EXPENSE_DETAILED" \| "INVOICE_TIME" \| "KIOSK_PIN_LIST" \| "ATTENDANCE_DETAILED" \| "ATTENDANCE_SUMMARY" \| "ASSIGNMENT_LIST" \| "ASSIGNMENT_SCHEDULE" \| "APPROVAL_DETAILED" \| "APPROVAL_SUMMARY" \| "BALANCE_LIST" \| "INVOICE_AMOUNT_LIST" \| "INVOICE_DETAILED" \| "TIMEOFF_DETAILED" \| "TIMEOFF_HOLIDAY" \| "TIMEOFF_BALANCE" \| "EXPENSE_SUMMARY"`, required)

### `delete`

**Request fields** (`DeleteSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)

