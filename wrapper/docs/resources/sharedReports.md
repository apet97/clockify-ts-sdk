# sharedReports

5 methods on `client.sharedReports`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `view`

**Request fields** (`ViewSharedReportsRequest`):

- `sharedReportId` (`string`, required)
- `exportType` (`"JSON_V1" \| "JSON" \| "CSV" \| "XLSX" \| "PDF"`, optional)
- `dateRangeStart` (`string`, optional) — Overrides the saved range start. `YYYY-MM-DDTHH:MM:SS`.
- `dateRangeEnd` (`string`, optional) — Overrides the saved range end. `YYYY-MM-DDTHH:MM:SS`.
- `sortColumn` (`string`, optional) — Validated against the report type; an unknown column returns 400.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional)
- `page` (`number`, optional)
- `pageSize` (`number`, optional)

### `list`

**Request fields** (`ListSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional)
- `pageSize` (`number`, optional)
- `sharedReportsFilter` (`"ALL" \| "ALL_ADMIN" \| "CREATED_BY_ME" \| "SHARED_WITH_ME"`, optional) — Filters shared reports by origin.

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

