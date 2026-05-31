# scheduling

16 methods on `client.scheduling`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `create`

**Request fields** (`CreateSchedulingRequest`):

- `workspaceId` (`string`, required)
- `billable` (`boolean`, optional)
- `excludeDays` (`Record<string, unknown>[]`, optional)
- `hoursPerDay` (`number`, required)
- `includeNonWorkingDays` (`boolean`, optional)
- `note` (`string`, optional)
- `period` (`ClockifyApi.DateTimeInterval`, required)
- `projectId` (`string`, required)
- `published` (`boolean`, optional) — Probes MUST keep published=false (draft) to avoid notifying other users.
- `repeat` (`boolean`, optional)
- `taskId` (`string`, optional)
- `userId` (`string`, required)
- `weeks` (`number`, optional)
- `workspaceId` (`string`, required)
- `body` (`CreateSchedulingRequestBody`, required)
- `billable` (`boolean`, optional)
- `excludeDays` (`Record<string, unknown>[]`, optional)
- `hoursPerDay` (`number`, required)
- `includeNonWorkingDays` (`boolean`, optional)
- `note` (`string`, optional)
- `period` (`ClockifyApi.DateTimeInterval`, required)
- `projectId` (`string`, required)
- `published` (`boolean`, optional) — Probes MUST keep published=false (draft) to avoid notifying other users.
- `repeat` (`boolean`, optional)
- `taskId` (`string`, optional)
- `userId` (`string`, required)
- `weeks` (`number`, optional)

### `update`

**Request fields** (`UpdateSchedulingRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `billable` (`boolean`, optional)
- `hoursPerDay` (`number`, optional)
- `id` (`string`, optional)
- `includeNonWorkingDays` (`boolean`, optional)
- `note` (`string \| null`, optional)
- `period` (`ClockifyApi.DateTimeInterval`, optional)
- `projectId` (`string`, optional)
- `published` (`boolean`, optional)
- `seriesId` (`string \| null`, optional)
- `taskId` (`string \| null`, optional)
- `userId` (`string`, optional)
- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `body` (`UpdateSchedulingRequestBody`, required)
- `billable` (`boolean`, optional)
- `hoursPerDay` (`number`, optional)
- `id` (`string`, optional)
- `includeNonWorkingDays` (`boolean`, optional)
- `note` (`string \| null`, optional)
- `period` (`ClockifyApi.DateTimeInterval`, optional)
- `projectId` (`string`, optional)
- `published` (`boolean`, optional)
- `seriesId` (`string \| null`, optional)
- `taskId` (`string \| null`, optional)
- `userId` (`string`, optional)
- `workspaceId` (`string`, optional)

### `delete`

**Request fields** (`DeleteSchedulingRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)

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
- `sort-column` (`ClockifyApi.AssignmentSortColumn`, optional) — Represents the column as the sorting criteria.
- `sort-order` (`ClockifyApi.SortOrder`, optional) — Represents the sorting mode.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

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

### `replaceRecurring`

**Request fields** (`ReplaceRecurringSchedulingRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `body` (`Record<string, unknown>`, required)

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

### `calculateUsersTotals`

**Request fields** (`CalculateUsersTotalsSchedulingRequest`):

- `workspaceId` (`string`, required)
- `end` (`string`, required)
- `start` (`string`, required)
- `workspaceId` (`string`, required)
- `body` (`CalculateUsersTotalsSchedulingRequestBody`, required)
- `end` (`string`, required)
- `start` (`string`, required)

