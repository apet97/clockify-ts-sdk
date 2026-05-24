# reports

4 methods on `client.reports`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `generateAttendanceReport`

**Example:**

```typescript
    await client.reports.generateAttendanceReport({
        workspaceId: "workspaceId",
        amountShown: "COST",
        amounts: ["EARNED", "COST"],
        approvalState: "APPROVED",
        archived: false,
        attendanceFilter: {
            breakFilters: [{
                    filtrationType: "EXACTLY",
                    value: "50"
                }],
            capacityFilters: [{
                    filtrationType: "EXACTLY",
                    value: "750"
                }],
            endFilters: [{
                    filtrationType: "EXACTLY",
                    value: "17:00"
                }],
            hasTimeOff: true,
            overtimeFilters: [{
                    filtrationType: "EXACTLY",
                    value: "150"
                }],
            page: 1,
            pageSize: 20,
            sortColumn: "USER",
            startFilters: [{
                    filtrationType: "EXACTLY",
                    value: "value"
                }],
            workFilters: [{
                    filtrationType: "EXACTLY",
                    value: "750"
                }]
        },
        billable: true,
        clients: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110792222"],
            status: "ACTIVE"
        },
        customFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        dateFormat: "2018-11-01",
        dateRangeEnd: "2018-11-30T23:59:59.999",
        dateRangeStart: "2018-11-01T00:00:00",
        dateRangeType: "LAST_MONTH",
        description: "some description keyword",
        exportType: "JSON",
        invoicingState: "INVOICED",
        projects: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110791111"],
            status: "ACTIVE"
        },
        rounding: false,
        sortOrder: "ASCENDING",
        timeFormat: "T00:00:00",
        timeZone: "Europe/Belgrade",
        userLocale: "en",
        weekStart: "MONDAY",
        withoutDescription: false,
        zoomLevel: "WEEK"
    })
```

**Request fields** (`AttendanceReportRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`AttendanceReportRequest.AmountShown`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`AttendanceReportRequest.ApprovalState`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `attendanceFilter` (`ClockifyApi.AttendanceFilter`, required)
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`AttendanceReportRequest.DateRangeType`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`AttendanceReportRequest.ExportType`, optional) — Export format requested for the report.
- `invoicingState` (`AttendanceReportRequest.InvoicingState`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`AttendanceReportRequest.SortOrder`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`AttendanceReportRequest.WeekStart`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`AttendanceReportRequest.ZoomLevel`, optional) — Report zoom level.

### `generateDetailedReport`

**Example:**

```typescript
    await client.reports.generateDetailedReport({
        workspaceId: "workspaceId",
        amountShown: "COST",
        amounts: ["EARNED", "COST"],
        approvalState: "APPROVED",
        archived: false,
        billable: true,
        clients: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110792222"],
            status: "ACTIVE"
        },
        customFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        dateFormat: "2018-11-01",
        dateRangeEnd: "2018-11-30T23:59:59.999",
        dateRangeStart: "2018-11-01T00:00:00",
        dateRangeType: "LAST_MONTH",
        description: "some description keyword",
        detailedFilter: {
            auditFilter: {
                duration: 2,
                durationShorter: false,
                withoutProject: false,
                withoutTask: true
            },
            options: {
                totals: "CALCULATE"
            },
            page: 1,
            pageSize: 20,
            sortColumn: "ID"
        },
        exportType: "JSON",
        invoicingState: "INVOICED",
        projects: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110791111"],
            status: "ACTIVE"
        },
        rounding: false,
        sortOrder: "ASCENDING",
        timeFormat: "T00:00:00",
        timeZone: "Europe/Belgrade",
        userCustomFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        userLocale: "en",
        weekStart: "MONDAY",
        withoutDescription: false,
        zoomLevel: "WEEK"
    })
```

**Request fields** (`DetailedReportRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`DetailedReportRequest.AmountShown`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`DetailedReportRequest.ApprovalState`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`DetailedReportRequest.DateRangeType`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `detailedFilter` (`ClockifyApi.DetailedFilter`, required)
- `exportType` (`DetailedReportRequest.ExportType`, optional) — Export format requested for the report.
- `invoicingState` (`DetailedReportRequest.InvoicingState`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`DetailedReportRequest.SortOrder`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`DetailedReportRequest.WeekStart`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`DetailedReportRequest.ZoomLevel`, optional) — Report zoom level.

### `generateSummaryReport`

**Example:**

```typescript
    await client.reports.generateSummaryReport({
        workspaceId: "workspaceId",
        amountShown: "COST",
        amounts: ["EARNED", "COST"],
        approvalState: "APPROVED",
        archived: false,
        billable: true,
        clients: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110792222"],
            status: "ACTIVE"
        },
        customFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        dateFormat: "2018-11-01",
        dateRangeEnd: "2018-11-30T23:59:59.999",
        dateRangeStart: "2018-11-01T00:00:00",
        dateRangeType: "LAST_MONTH",
        description: "some description keyword",
        exportType: "JSON",
        invoicingState: "INVOICED",
        projects: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110791111"],
            status: "ACTIVE"
        },
        rounding: false,
        sortOrder: "ASCENDING",
        summaryFilter: {
            groups: ["CLIENT", "PROJECT", "USER"],
            sortColumn: "GROUP",
            summaryChartType: "PROJECT"
        },
        timeFormat: "T00:00:00",
        timeZone: "Europe/Belgrade",
        userCustomFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        userLocale: "en",
        weekStart: "MONDAY",
        withoutDescription: false,
        zoomLevel: "WEEK"
    })
```

**Request fields** (`SummaryReportRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`SummaryReportRequest.AmountShown`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`SummaryReportRequest.ApprovalState`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`SummaryReportRequest.DateRangeType`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`SummaryReportRequest.ExportType`, optional) — Export format requested for the report.
- `invoicingState` (`SummaryReportRequest.InvoicingState`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`SummaryReportRequest.SortOrder`, optional) — Sort order.
- `summaryFilter` (`ClockifyApi.SummaryFilter`, required)
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`SummaryReportRequest.WeekStart`, optional) — Configured week start day.
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`SummaryReportRequest.ZoomLevel`, optional) — Report zoom level.

### `generateWeeklyReport`

**Example:**

```typescript
    await client.reports.generateWeeklyReport({
        workspaceId: "workspaceId",
        amountShown: "COST",
        amounts: ["EARNED", "COST"],
        approvalState: "APPROVED",
        archived: false,
        billable: true,
        clients: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110792222"],
            status: "ACTIVE"
        },
        customFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        dateFormat: "2018-11-01",
        dateRangeEnd: "2018-11-30T23:59:59.999",
        dateRangeStart: "2018-11-01T00:00:00",
        dateRangeType: "LAST_MONTH",
        description: "some description keyword",
        exportType: "JSON",
        invoicingState: "INVOICED",
        projects: {
            contains: "CONTAINS",
            ids: ["5b715448b079875110791111"],
            status: "ACTIVE"
        },
        rounding: false,
        sortOrder: "ASCENDING",
        timeFormat: "T00:00:00",
        timeZone: "Europe/Belgrade",
        userCustomFields: [{
                id: "5b71544ab0798751107918b3",
                isEmpty: false,
                numberCondition: "EQUAL",
                type: "NUMBER",
                value: 2000
            }],
        userLocale: "en",
        weekStart: "MONDAY",
        weeklyFilter: {
            group: "USER",
            subgroup: "TIME"
        },
        withoutDescription: false,
        zoomLevel: "WEEK"
    })
```

**Request fields** (`WeeklyReportRequest`):

- `workspaceId` (`string`, required)
- `amountShown` (`WeeklyReportRequest.AmountShown`, optional) — If provided, returns reports with the provided amount shown.
- `amounts` (`ClockifyApi.AmountType[]`, optional) — Amount columns to include.
- `approvalState` (`WeeklyReportRequest.ApprovalState`, optional) — If provided, returns reports with the provided approval state.
- `archived` (`boolean`, optional) — Indicates whether the report is archived.
- `billable` (`boolean`, optional) — Indicates whether the report is billable.
- `clients` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `currency` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `customFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — Time entry custom field filters.
- `dateFormat` (`string`, optional) — Provide date in format YYYY-MM-DD.
- `dateRangeEnd` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeStart` (`string`, required) — Provide date in format YYYY-MM-DDTHH:MM:SS.ssssss. Interpreted using the user's timezone or the provided timeZone.
- `dateRangeType` (`WeeklyReportRequest.DateRangeType`, optional) — Date range preset.
- `description` (`string`, optional) — Search term for filtering report entries by description.
- `exportType` (`WeeklyReportRequest.ExportType`, optional) — Export format requested for the report.
- `invoicingState` (`WeeklyReportRequest.InvoicingState`, optional) — If provided, returns reports with the provided invoicing state.
- `projects` (`ClockifyApi.ContainsArchivedFilter`, optional)
- `rounding` (`boolean`, optional) — Indicates whether report filter rounding is enabled.
- `sortOrder` (`WeeklyReportRequest.SortOrder`, optional) — Sort order.
- `tags` (`ClockifyApi.ContainsTagFilter`, optional)
- `tasks` (`ClockifyApi.ContainsTaskFilter`, optional)
- `timeFormat` (`string`, optional) — Provide time in format THH:MM:SS.ssssss.
- `timeZone` (`string`, optional) — Timezone used to interpret dates and times.
- `userCustomFields` (`ClockifyApi.CustomFieldFilter[]`, optional) — User custom field filters.
- `userGroups` (`ClockifyApi.ContainsUsersFilter`, optional)
- `userLocale` (`string`, optional) — Locale used for report formatting.
- `users` (`ClockifyApi.ContainsUsersFilter`, optional)
- `weekStart` (`WeeklyReportRequest.WeekStart`, optional) — Configured week start day.
- `weeklyFilter` (`ClockifyApi.WeeklyFilter`, required)
- `withoutDescription` (`boolean`, optional) — If true, report includes only entries with empty description.
- `zoomLevel` (`WeeklyReportRequest.ZoomLevel`, optional) — Report zoom level.

