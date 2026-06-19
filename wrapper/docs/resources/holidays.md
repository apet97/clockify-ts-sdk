# holidays

5 methods on `client.holidays`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListHolidaysRequest`):

- `workspaceId` (`string`, required)
- `assigned-to` (`string`, optional) — If provided, returns a filtered list of holidays assigned to the user.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Request fields** (`CreateHolidayRequest`):

- `workspaceId` (`string`, required)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `datePeriod` (`ClockifyApi.DatePeriodRequest`, required)
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether the holiday is shown to new users.
- `name` (`string`, required) — Provide the name of the holiday.
- `occursAnnually` (`boolean`, optional) — Indicates whether the holiday occurs annually.
- `userGroups` (`ClockifyApi.UserGroupIdsSchema`, optional)
- `users` (`ClockifyApi.UserIdsSchema`, optional)
- `workspaceId` (`string`, required)
- `body` (`CreateHolidayRequestBody`, required)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `datePeriod` (`ClockifyApi.DatePeriodRequest`, required)
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether the holiday is shown to new users.
- `name` (`string`, required) — Provide the name of the holiday.
- `occursAnnually` (`boolean`, optional) — Indicates whether the holiday occurs annually.
- `userGroups` (`ClockifyApi.UserGroupIdsSchema`, optional)
- `users` (`ClockifyApi.UserIdsSchema`, optional)

### `update`

**Request fields** (`UpdateHolidaysRequest`):

- `workspaceId` (`string`, required)
- `holidayId` (`string`, required)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `datePeriod` (`ClockifyApi.DatePeriodRequest`, required)
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether the holiday is shown to new users.
- `name` (`string`, required) — Provide the name you would like to use for updating the holiday.
- `occursAnnually` (`boolean`, required) — Indicates whether the holiday occurs annually.
- `userGroups` (`ClockifyApi.ContainsUserGroupFilterRequest`, optional)
- `users` (`ClockifyApi.ContainsUsersFilterRequestForHoliday`, optional)
- `workspaceId` (`string`, required)
- `holidayId` (`string`, required)
- `body` (`UpdateHolidaysRequestBody`, required)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `datePeriod` (`ClockifyApi.DatePeriodRequest`, required)
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether the holiday is shown to new users.
- `name` (`string`, required) — Provide the name you would like to use for updating the holiday.
- `occursAnnually` (`boolean`, required) — Indicates whether the holiday occurs annually.
- `userGroups` (`ClockifyApi.ContainsUserGroupFilterRequest`, optional)
- `users` (`ClockifyApi.ContainsUsersFilterRequestForHoliday`, optional)

### `delete`

**Request fields** (`DeleteHolidaysRequest`):

- `workspaceId` (`string`, required)
- `holidayId` (`string`, required)

### `listInPeriod`

**Request fields** (`ListInPeriodHolidaysRequest`):

- `workspaceId` (`string`, required)
- `assigned-to` (`string`, required)
- `start` (`string`, required) — Filter list of holidays starting from start date. Expected date format yyyy-MM-ddThh:mm:ssZ.
- `end` (`string`, required) — Filter list of holidays ending by end date. Expected date format yyyy-MM-ddThh:mm:ssZ.

