# scheduling

16 methods on `client.scheduling`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `postWorkspacesWorkspaceIdSchedulingAssignments`

**Example:**

```typescript
    await client.scheduling.postWorkspacesWorkspaceIdSchedulingAssignments({
        workspaceId: "workspaceId",
        hoursPerDay: 1.1,
        period: {},
        projectId: "projectId",
        userId: "userId"
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdSchedulingAssignmentsRequest`):

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

### `getAllSchedulingAssignments`

**Example:**

```typescript
    await client.scheduling.getAllSchedulingAssignments({
        workspaceId: "64a687e29ae1f428e7ebe303",
        name: "Bugfixing"
    })
```

**Request fields** (`GetAllSchedulingAssignmentsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional) — If provided, assignments will be filtered by name.
- `sort-column` (`ClockifyApi.AssignmentSortColumn`, optional) — Represents the column as the sorting criteria.
- `sort-order` (`ClockifyApi.SortOrder`, optional) — Represents the sorting mode.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `getScheduledAssignmentsPerProject`

**Example:**

```typescript
    await client.scheduling.getScheduledAssignmentsPerProject({
        workspaceId: "64a687e29ae1f428e7ebe303",
        end: "2021-01-01T00:00:00Z",
        page: 1,
        pageSize: 50,
        search: "Software",
        start: "2020-01-01T00:00:00Z",
        statusFilter: "ALL"
    })
```

**Request fields** (`ProjectTotalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `search` (`string`, optional) — Represents a term for searching projects and clients by name.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `statusFilter` (`ClockifyApi.StatusFilter`, optional)

### `getScheduledAssignmentsOnProject`

**Example:**

```typescript
    await client.scheduling.getScheduledAssignmentsOnProject({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "56b687e29ae1f428e7ebe504"
    })
```

**Request fields** (`GetScheduledAssignmentsOnProjectRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.

### `publishAssignments`

**Example:**

```typescript
    await client.scheduling.publishAssignments({
        workspaceId: "64a687e29ae1f428e7ebe303",
        end: "2021-01-01T00:00:00Z",
        notifyUsers: false,
        search: "John",
        start: "2020-01-01T00:00:00Z",
        viewType: "ALL"
    })
```

**Request fields** (`PublishAssignmentsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, required) — Represents end date in yyyy-MM-ddThh:mm:ssZ format.
- `notifyUsers` (`boolean`, optional) — Indicates whether to notify users when assignment is published.
- `search` (`string`, optional) — Represents a search string.
- `start` (`string`, required) — Represents start date in yyyy-MM-ddThh:mm:ssZ format.
- `userFilter` (`ClockifyApi.ContainsUsersFilterRequestV1`, optional)
- `userGroupFilter` (`ClockifyApi.ContainsUserGroupFilterRequestV1`, optional)
- `viewType` (`ClockifyApi.SchedulingViewType`, optional)

### `createRecurringAssignment`

**Example:**

```typescript
    await client.scheduling.createRecurringAssignment({
        workspaceId: "64a687e29ae1f428e7ebe303",
        billable: false,
        end: "2021-01-01T00:00:00Z",
        hoursPerDay: 7.5,
        includeNonWorkingDays: false,
        note: "This is a sample note for an assignment.",
        projectId: "56b687e29ae1f428e7ebe504",
        recurringAssignment: {
            repeat: true,
            weeks: 2
        },
        start: "2020-01-01T00:00:00Z",
        startTime: "10:00:00",
        taskId: "36b687e29ae1f428e7ebe109",
        userId: "72k687e29ae1f428e7ebe109"
    })
```

**Request fields** (`CreateRecurringAssignmentRequest`):

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

### `putWorkspacesWorkspaceIdSchedulingAssignmentsRecurringAssignmentId`

**Example:**

```typescript
    await client.scheduling.putWorkspacesWorkspaceIdSchedulingAssignmentsRecurringAssignmentId({
        workspaceId: "workspaceId",
        assignmentId: "assignmentId",
        body: {
            "key": "value"
        }
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdSchedulingAssignmentsRecurringAssignmentIdRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `body` (`Record<string, unknown>`, required)

### `deleteRecurringAssignment`

**Example:**

```typescript
    await client.scheduling.deleteRecurringAssignment({
        workspaceId: "64a687e29ae1f428e7ebe303",
        assignmentId: "5b641568b07987035750505e"
    })
```

**Request fields** (`DeleteRecurringAssignmentRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.

### `updateRecurringAssignment`

**Example:**

```typescript
    await client.scheduling.updateRecurringAssignment({
        workspaceId: "64a687e29ae1f428e7ebe303",
        assignmentId: "5b641568b07987035750505e",
        billable: false,
        end: "2021-01-01T00:00:00Z",
        hoursPerDay: 7.5,
        includeNonWorkingDays: false,
        note: "This is a sample note for an assignment.",
        seriesUpdateOption: "THIS_ONE",
        start: "2020-01-01T00:00:00Z",
        startTime: "10:00:00",
        taskId: "36b687e29ae1f428e7ebe109"
    })
```

**Request fields** (`UpdateRecurringAssignmentRequest`):

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

### `changeRecurringPeriod`

**Example:**

```typescript
    await client.scheduling.changeRecurringPeriod({
        workspaceId: "64a687e29ae1f428e7ebe303",
        assignmentId: "5b641568b07987035750505e",
        repeat: true,
        weeks: 2
    })
```

**Request fields** (`ChangeRecurringPeriodRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `repeat` (`boolean`, required) — Indicates whether assignment is recurring or not.
- `weeks` (`number`, required) — Indicates number of weeks for assignment.

### `getUsersCapacityTotals`

**Example:**

```typescript
    await client.scheduling.getUsersCapacityTotals({
        workspaceId: "64a687e29ae1f428e7ebe303",
        end: "2021-01-01T00:00:00Z",
        page: 1,
        pageSize: 50,
        search: "John",
        start: "2020-01-01T00:00:00Z",
        statusFilter: "ALL"
    })
```

**Request fields** (`UserCapacityTotalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, required) — Represents an end date in the yyyy-MM-ddThh:mm:ssZ format.
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `search` (`string`, optional) — Represents the keyword for searching users by name or email.
- `start` (`string`, required) — Represents a start date in the yyyy-MM-ddThh:mm:ssZ format.
- `statusFilter` (`ClockifyApi.StatusFilter`, optional)
- `userFilter` (`ClockifyApi.ContainsUsersFilterRequestV1`, optional)
- `userGroupFilter` (`ClockifyApi.ContainsUserGroupFilterRequestV1`, optional)

### `postWorkspacesWorkspaceIdSchedulingAssignmentsUsersTotals`

**Example:**

```typescript
    await client.scheduling.postWorkspacesWorkspaceIdSchedulingAssignmentsUsersTotals({
        workspaceId: "workspaceId",
        end: "2024-01-15T09:30:00Z",
        start: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdSchedulingAssignmentsUsersTotalsRequest`):

- `workspaceId` (`string`, required)
- `end` (`string`, required)
- `start` (`string`, required)

### `getUserCapacityTotal`

**Example:**

```typescript
    await client.scheduling.getUserCapacityTotal({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f"
    })
```

**Request fields** (`GetUserCapacityTotalRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `putWorkspacesWorkspaceIdSchedulingAssignmentsAssignmentId`

**Example:**

```typescript
    await client.scheduling.putWorkspacesWorkspaceIdSchedulingAssignmentsAssignmentId({
        workspaceId: "workspaceId",
        assignmentId: "assignmentId",
        body: {}
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdSchedulingAssignmentsAssignmentIdRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `body` (`ClockifyApi.OpenapiSchedulingAssignment`, required)

### `deleteWorkspacesWorkspaceIdSchedulingAssignmentsAssignmentId`

**Example:**

```typescript
    await client.scheduling.deleteWorkspacesWorkspaceIdSchedulingAssignmentsAssignmentId({
        workspaceId: "workspaceId",
        assignmentId: "assignmentId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdSchedulingAssignmentsAssignmentIdRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)

### `copyScheduledAssignment`

**Example:**

```typescript
    await client.scheduling.copyScheduledAssignment({
        workspaceId: "64a687e29ae1f428e7ebe303",
        assignmentId: "5b641568b07987035750505e",
        seriesUpdateOption: "THIS_ONE",
        userId: "72k687e29ae1f428e7ebe109"
    })
```

**Request fields** (`CopyAssignmentRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.
- `seriesUpdateOption` (`ClockifyApi.SeriesUpdateOption`, required)
- `userId` (`string`, required) — Represents a user identifier across the system.

