# scheduling

16 methods on `client.scheduling`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `create`

**Example:**

```typescript
    await client.scheduling.create({
        workspaceId: "workspaceId",
        hoursPerDay: 1.1,
        period: {},
        projectId: "projectId",
        userId: "userId"
    })
```

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

### `list`

**Example:**

```typescript
    await client.scheduling.list({
        workspaceId: "64a687e29ae1f428e7ebe303",
        name: "Bugfixing"
    })
```

**Request fields** (`ListSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional) — If provided, assignments will be filtered by name.
- `sort-column` (`ClockifyApi.AssignmentSortColumn`, optional) — Represents the column as the sorting criteria.
- `sort-order` (`ClockifyApi.SortOrder`, optional) — Represents the sorting mode.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `listPerProject`

**Example:**

```typescript
    await client.scheduling.listPerProject({
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

### `listOnProject`

**Example:**

```typescript
    await client.scheduling.listOnProject({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "56b687e29ae1f428e7ebe504"
    })
```

**Request fields** (`ListOnProjectSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.

### `publish`

**Example:**

```typescript
    await client.scheduling.publish({
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

### `createRecurring`

**Example:**

```typescript
    await client.scheduling.createRecurring({
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

### `replaceRecurring`

**Example:**

```typescript
    await client.scheduling.replaceRecurring({
        workspaceId: "workspaceId",
        assignmentId: "assignmentId",
        body: {
            "key": "value"
        }
    })
```

**Request fields** (`ReplaceRecurringSchedulingRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `body` (`Record<string, unknown>`, required)

### `deleteRecurring`

**Example:**

```typescript
    await client.scheduling.deleteRecurring({
        workspaceId: "64a687e29ae1f428e7ebe303",
        assignmentId: "5b641568b07987035750505e"
    })
```

**Request fields** (`DeleteRecurringSchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `assignmentId` (`string`, required) — Represents an assignment identifier across the system.

### `updateRecurring`

**Example:**

```typescript
    await client.scheduling.updateRecurring({
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

### `getUsersCapacityFiltered`

**Example:**

```typescript
    await client.scheduling.getUsersCapacityFiltered({
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

### `calculateUsersTotals`

**Example:**

```typescript
    await client.scheduling.calculateUsersTotals({
        workspaceId: "workspaceId",
        end: "2024-01-15T09:30:00Z",
        start: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`CalculateUsersTotalsSchedulingRequest`):

- `workspaceId` (`string`, required)
- `end` (`string`, required)
- `start` (`string`, required)

### `getUserCapacity`

**Example:**

```typescript
    await client.scheduling.getUserCapacity({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f"
    })
```

**Request fields** (`GetUserCapacitySchedulingRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `update`

**Example:**

```typescript
    await client.scheduling.update({
        workspaceId: "workspaceId",
        assignmentId: "assignmentId",
        body: {}
    })
```

**Request fields** (`UpdateSchedulingRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)
- `body` (`ClockifyApi.OpenapiSchedulingAssignment`, required)

### `delete`

**Example:**

```typescript
    await client.scheduling.delete({
        workspaceId: "workspaceId",
        assignmentId: "assignmentId"
    })
```

**Request fields** (`DeleteSchedulingRequest`):

- `workspaceId` (`string`, required)
- `assignmentId` (`string`, required)

### `copy`

**Example:**

```typescript
    await client.scheduling.copy({
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

