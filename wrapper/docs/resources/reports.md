# reports

4 methods on `client.reports`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `attendance`

**Request fields** (`AttendanceReportsRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `attendanceFilter` (`ClockifyApi.AttendanceFilter`, required)
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.
- `workspaceId` (`string`, required)
- `body` (`AttendanceReportsRequestBody`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `attendanceFilter` (`ClockifyApi.AttendanceFilter`, required)
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.

### `detailed`

**Request fields** (`DetailedReportsRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `detailedFilter` (`ClockifyApi.DetailedFilter`, required)
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.
- `workspaceId` (`string`, required)
- `body` (`DetailedReportsRequestBody`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `detailedFilter` (`ClockifyApi.DetailedFilter`, required)
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.

### `summary`

**Request fields** (`SummaryReportsRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `summaryFilter` (`ClockifyApi.SummaryFilter`, required)
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.
- `workspaceId` (`string`, required)
- `body` (`SummaryReportsRequestBody`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `summaryFilter` (`ClockifyApi.SummaryFilter`, required)
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.

### `weekly`

**Request fields** (`WeeklyReportsRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `weeklyFilter` (`ClockifyApi.WeeklyFilter`, required)
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.
- `workspaceId` (`string`, required)
- `body` (`WeeklyReportsRequestBody`, required)
- `amountShown` (`"EARNED" \| "COST" \| "PROFIT" \| "HIDE_AMOUNT" \| "EXPORT"`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`"APPROVED" \| "UNAPPROVED" \| "ALL"`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`"ABSOLUTE" \| "TODAY" \| "YESTERDAY" \| "THIS_WEEK" \| "LAST_WEEK" \| "PAST_TWO_WEEKS" \| "THIS_MONTH" \| "LAST_MONTH" \| "THIS_YEAR" \| "LAST_YEAR"`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`"JSON" \| "JSON_V1" \| "PDF" \| "CSV" \| "XLSX" \| "ZIP"`, optional) — Export format requested for the report.
- `invoicingState` (`"INVOICED" \| "UNINVOICED" \| "ALL"`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`"MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY"`, optional) — Configured week start day.
- `weeklyFilter` (`ClockifyApi.WeeklyFilter`, required)
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`"WEEK" \| "MONTH" \| "YEAR"`, optional) — Report zoom level.

