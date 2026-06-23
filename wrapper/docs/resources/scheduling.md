# scheduling

11 methods on `client.scheduling`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `copy`

**Request fields** (`CopySchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `seriesUpdateOption` (`ClockifyApi.SeriesUpdateOption`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `body` (`CopySchedulingRequestBody`, required)
- `seriesUpdateOption` (`ClockifyApi.SeriesUpdateOption`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.

### `list`

**Request fields** (`ListSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional) — If provided, assignments will be filtered by name.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `sort-column` (`ClockifyApi.AssignmentSortColumn`, optional) — Represents the column as the sorting criteria.
- `sort-order` (`ClockifyApi.SortOrder`, optional) — Represents the sorting mode.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.

### `listPerProject`

**Request fields** (`ListPerProjectSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `search` (`string`, optional) — Represents a term for searching projects and clients by name.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `statusFilter` (`ClockifyApi.StatusFilter`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ListPerProjectSchedulingRequestBody`, required)
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `search` (`string`, optional) — Represents a term for searching projects and clients by name.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `statusFilter` (`ClockifyApi.StatusFilter`, optional)

### `listOnProject`

**Request fields** (`ListOnProjectSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `start` (`string`, required) — Required by live Clockify; the single-project schedule-totals GET 400s without an ISO-8601 start.
- `end` (`string`, required) — Required by live Clockify; the single-project schedule-totals GET 400s without an ISO-8601 end.

### `publish`

**Request fields** (`PublishSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, required) — Represents end date in yyyy-MM-ddThh:mm:ssZ format.
- `notifyUsers` (`boolean`, optional) — Indicates whether to notify users when assignment is published.
- `search` (`string`, optional) — Represents a search string.
- `start` (`string`, required) — Represents start date in yyyy-MM-ddThh:mm:ssZ format.
- `userFilter` (`ClockifyApi.ContainsUsersFilterRequestV1`, optional)
- `userGroupFilter` (`ClockifyApi.ContainsUserGroupFilterRequestV1`, optional)
- `viewType` (`ClockifyApi.SchedulingViewType`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`PublishSchedulingRequestBody`, required)
- `end` (`string`, required) — Represents end date in yyyy-MM-ddThh:mm:ssZ format.
- `notifyUsers` (`boolean`, optional) — Indicates whether to notify users when assignment is published.
- `search` (`string`, optional) — Represents a search string.
- `start` (`string`, required) — Represents start date in yyyy-MM-ddThh:mm:ssZ format.
- `userFilter` (`ClockifyApi.ContainsUsersFilterRequestV1`, optional)
- `userGroupFilter` (`ClockifyApi.ContainsUserGroupFilterRequestV1`, optional)
- `viewType` (`ClockifyApi.SchedulingViewType`, optional)

### `createRecurring`

**Request fields** (`CreateRecurringSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `billable` (`boolean`, optional) — Indicates whether assignment is billable or not.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `hoursPerDay` (`number`, required) — Represents assignment total hours per day.
- `includeNonWorkingDays` (`boolean`, optional) — Indicates whether to include non-working days or not.
- `note` (`string`, optional) — Represents an assignment note.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `recurringAssignment` (`ClockifyApi.RecurringAssignmentRequestV1`, optional)
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `startTime` (`string`, optional) — Represents a start time in the hh:mm:ss format.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`CreateRecurringSchedulingRequestBody`, required)
- `billable` (`boolean`, optional) — Indicates whether assignment is billable or not.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `hoursPerDay` (`number`, required) — Represents assignment total hours per day.
- `includeNonWorkingDays` (`boolean`, optional) — Indicates whether to include non-working days or not.
- `note` (`string`, optional) — Represents an assignment note.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `recurringAssignment` (`ClockifyApi.RecurringAssignmentRequestV1`, optional)
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `startTime` (`string`, optional) — Represents a start time in the hh:mm:ss format.
- `taskId` (`string`, optional) — Represents a task identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `updateRecurring`

**Request fields** (`UpdateRecurringSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `billable` (`boolean`, optional) — Indicates whether assignment is billable or not.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `hoursPerDay` (`number`, optional) — Represents assignment total hours per day.
- `includeNonWorkingDays` (`boolean`, optional) — Indicates whether to include non-working days or not.
- `note` (`string`, optional) — Represents an assignment note.
- `seriesUpdateOption` (`ClockifyApi.SeriesUpdateOption`, optional)
- `start` (`string`, required) — Represents start date in yyyy-MM-ddThh:mm:ssZ format.
- `startTime` (`string`, optional) — Represents a start time in the hh:mm:ss format.
- `taskId` (`string`, optional) — Represents task identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `body` (`UpdateRecurringSchedulingRequestBody`, required)
- `billable` (`boolean`, optional) — Indicates whether assignment is billable or not.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `hoursPerDay` (`number`, optional) — Represents assignment total hours per day.
- `includeNonWorkingDays` (`boolean`, optional) — Indicates whether to include non-working days or not.
- `note` (`string`, optional) — Represents an assignment note.
- `seriesUpdateOption` (`ClockifyApi.SeriesUpdateOption`, optional)
- `start` (`string`, required) — Represents start date in yyyy-MM-ddThh:mm:ssZ format.
- `startTime` (`string`, optional) — Represents a start time in the hh:mm:ss format.
- `taskId` (`string`, optional) — Represents task identifier across the system.

### `deleteRecurring`

**Request fields** (`DeleteRecurringSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `seriesUpdateOption` (`ClockifyApi.SeriesUpdateOption`, optional) — Represents a series option.

### `changeRecurringPeriod`

**Request fields** (`ChangeRecurringPeriodSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `repeat` (`boolean`, required) — Indicates whether assignment is recurring or not.
- `weeks` (`number`, required) — Indicates number of weeks for assignment.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `body` (`ChangeRecurringPeriodSchedulingRequestBody`, required)
- `repeat` (`boolean`, required) — Indicates whether assignment is recurring or not.
- `weeks` (`number`, required) — Indicates number of weeks for assignment.

### `getUsersCapacityFiltered`

**Request fields** (`GetUsersCapacityFilteredSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `search` (`string`, optional) — Represents the keyword for searching users by name or email.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `statusFilter` (`ClockifyApi.StatusFilter`, optional)
- `userFilter` (`ClockifyApi.ContainsUsersFilterRequestV1`, optional)
- `userGroupFilter` (`ClockifyApi.ContainsUserGroupFilterRequestV1`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`GetUsersCapacityFilteredSchedulingRequestBody`, required)
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `search` (`string`, optional) — Represents the keyword for searching users by name or email.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `statusFilter` (`ClockifyApi.StatusFilter`, optional)
- `userFilter` (`ClockifyApi.ContainsUsersFilterRequestV1`, optional)
- `userGroupFilter` (`ClockifyApi.ContainsUserGroupFilterRequestV1`, optional)

### `getUserCapacity`

**Request fields** (`GetUserCapacitySchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.

