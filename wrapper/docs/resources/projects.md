# projects

15 methods on `client.projects`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.projects.list({
        workspaceId: "64a687e29ae1f428e7ebe303",
        name: "Software Development",
        "expense-date": "2024-12-31"
    })
```

**Request fields** (`ListProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional) — If provided, returns projects whose name contains the provided string.
- `strict-name-search` (`boolean`, optional) — When true, search by name returns only projects whose name exactly matches the name parameter.
- `archived` (`boolean`, optional) — If true, returns only archived projects. If omitted, returns both archived and non-archived projects.
- `billable` (`boolean`, optional) — If true, returns only billable projects. If omitted, returns both billable and non-billable projects.
- `clients` (`string \| string[]`, optional) — If provided, returns projects that contain clients matching any provided ids.
- `contains-client` (`boolean`, optional) — Controls whether the clients filter includes or excludes matching client ids.
- `client-status` (`ClockifyApi.ListProjectsRequestClientStatus`, optional) — Filters projects based on client status.
- `users` (`string \| string[]`, optional) — If provided, returns projects that contain users matching any provided ids.
- `contains-user` (`boolean`, optional) — Controls whether the users filter includes or excludes matching user ids.
- `user-status` (`ClockifyApi.ListProjectsRequestUserStatus`, optional) — Filters projects based on user status.
- `is-template` (`boolean`, optional) — Filters projects based on whether they are used as a template or not.
- `sort-column` (`ClockifyApi.ListProjectsRequestSortColumn`, optional) — Sorts the results by the given column/field.
- `sort-order` (`ClockifyApi.ListProjectsRequestSortOrder`, optional) — Sorting mode.
- `hydrated` (`boolean`, optional) — If true, results contain additional information about the project.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `access` (`ClockifyApi.ListProjectsRequestAccess`, optional) — If provided, returns projects that match the provided access.
- `expense-limit` (`number`, optional) — Represents the maximum number of expenses to fetch.
- `expense-date` (`string`, optional) — If provided, returns expenses dated before the provided yyyy-MM-dd date.
- `userGroups` (`string \| string[]`, optional) — If provided, returns projects that contain groups matching any provided ids.
- `contains-group` (`boolean`, optional) — Controls whether the userGroups filter includes or excludes matching group ids.

### `create`

**Example:**

```typescript
    await client.projects.create({
        workspaceId: "64a687e29ae1f428e7ebe303",
        billable: false,
        clientId: "9t641568b07987035750704",
        color: "#000000",
        costRate: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        },
        estimate: {
            estimate: "PT1H30M",
            type: "AUTO"
        },
        hourlyRate: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        },
        isPublic: false,
        memberships: [{
                hourlyRate: {
                    amount: 20000,
                    since: "2020-01-01T00:00:00Z"
                },
                membershipStatus: "ACTIVE",
                membershipType: "PROJECT",
                userId: "45b687e29ae1f428e7ebe123"
            }],
        name: "Software Development",
        note: "This is a sample note for the project.",
        tasks: [{
                assigneeIds: ["45b687e29ae1f428e7ebe123"],
                billable: false,
                budgetEstimate: 10000,
                estimate: "PT1H30M",
                name: "Bugfixing",
                status: "ACTIVE"
            }]
    })
```

**Request fields** (`CreateProjectRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `billable` (`boolean`, optional) — Indicates whether project is billable or not.
- `clientId` (`string`, optional) — Represents client identifier across the system.
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `costRate` (`ClockifyApi.RateRequest`, optional)
- `estimate` (`ClockifyApi.EstimateRequest`, optional)
- `hourlyRate` (`ClockifyApi.RateRequest`, optional)
- `isPublic` (`boolean`, optional) — Indicates whether project is public or not.
- `memberships` (`ClockifyApi.MembershipRequest[]`, optional) — Represents a list of membership request objects.
- `name` (`string`, required) — Represents a project name.
- `note` (`string`, optional) — Represents project note.
- `tasks` (`ClockifyApi.TaskRequest[]`, optional) — Represents a list of task request objects.

### `createFromTemplate`

**Example:**

```typescript
    await client.projects.createFromTemplate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        clientId: "9t641568b07987035750704",
        color: "#000000",
        isPublic: false,
        name: "Software Development",
        templateProjectId: "5b641568b07987035750505e"
    })
```

**Request fields** (`CreateProjectFromTemplateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `clientId` (`string`, optional) — Represents a client identifier across the system.
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `isPublic` (`boolean`, optional) — Indicates whether the project is public or not.
- `name` (`string`, required) — Represents a project name.
- `templateProjectId` (`string`, required) — Represents a project identifier across the system.

### `get`

**Example:**

```typescript
    await client.projects.get({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        "custom-field-entity-type": "TIMEENTRY",
        "expense-date": "2024-12-31"
    })
```

**Request fields** (`GetProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `hydrated` (`boolean`, optional) — If true, results contain additional information about the project.
- `custom-field-entity-type` (`string`, optional) — Filters custom fields by custom field entity type.
- `expense-limit` (`number`, optional) — Represents the maximum number of expenses to fetch.
- `expense-date` (`string`, optional) — If provided, returns expenses dated before the provided yyyy-MM-dd date.

### `update`

**Example:**

```typescript
    await client.projects.update({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        archived: false,
        billable: false,
        clientId: "9t641568b07987035750704",
        color: "#000000",
        costRate: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        },
        hourlyRate: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        },
        isPublic: false,
        name: "Software Development",
        note: "This is a sample note for the project."
    })
```

**Request fields** (`UpdateProjectRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `archived` (`boolean`, optional) — Indicates whether project is archived or not.
- `billable` (`boolean`, optional) — Indicates whether project is billable or not.
- `clientId` (`string`, optional) — Represents client identifier across the system.
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `costRate` (`ClockifyApi.RateRequest`, optional)
- `hourlyRate` (`ClockifyApi.RateRequest`, optional)
- `isPublic` (`boolean`, optional) — Indicates whether project is public or not.
- `name` (`string`, optional) — Represents a project name.
- `note` (`string`, optional) — Represents project note.

### `delete`

**Example:**

```typescript
    await client.projects.delete({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e"
    })
```

**Request fields** (`DeleteProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.

### `archive`

**Example:**

```typescript
    await client.projects.archive({
        workspaceId: "workspaceId",
        projectId: "projectId"
    })
```

**Request fields** (`ArchiveProjectsRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `archived` (`boolean`, optional)

### `updateCostRate`

**Example:**

```typescript
    await client.projects.updateCostRate({
        workspaceId: "workspaceId",
        projectId: "projectId",
        amount: 1
    })
```

**Request fields** (`UpdateCostRateProjectsRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `amount` (`number`, required)
- `since` (`string`, optional)
- `sinceAsInstant` (`string`, optional)

### `updateEstimate`

**Example:**

```typescript
    await client.projects.updateEstimate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        budgetEstimate: {
            active: true,
            estimate: 10000,
            includeExpenses: false,
            resetOption: "MONTHLY",
            type: "AUTO"
        },
        estimateReset: {
            active: true,
            dayOfMonth: 1,
            dayOfWeek: "MONDAY",
            hour: 0,
            interval: "MONTHLY",
            isActive: true,
            month: "JANUARY"
        },
        timeEstimate: {
            active: true,
            estimate: "PT1H30M",
            includeNonBillable: false,
            resetOption: "MONTHLY",
            type: "AUTO"
        }
    })
```

**Request fields** (`UpdateProjectEstimateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `budgetEstimate` (`ClockifyApi.EstimateWithOptionsRequest`, optional)
- `estimateReset` (`ClockifyApi.EstimateResetRequest`, optional)
- `timeEstimate` (`ClockifyApi.TimeEstimateRequest`, optional)

### `updateHourlyRate`

**Example:**

```typescript
    await client.projects.updateHourlyRate({
        workspaceId: "workspaceId",
        projectId: "projectId",
        amount: 1
    })
```

**Request fields** (`UpdateHourlyRateProjectsRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `amount` (`number`, required)
- `since` (`string`, optional)
- `sinceAsInstant` (`string`, optional)

### `setMembers`

**Example:**

```typescript
    await client.projects.setMembers({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        remove: false,
        userGroups: {
            contains: "CONTAINS",
            ids: ["67b687e29ae1f428e7ebe123"],
            status: "ACTIVE"
        },
        userIds: ["45b687e29ae1f428e7ebe123", "67s687e29ae1f428e7ebe678"]
    })
```

**Request fields** (`AssignRemoveUsersRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `remove` (`boolean`, optional) — Setting this flag to true will remove the given users from the project.
- `userGroups` (`ClockifyApi.ProjectsUserGroupIdsSchema`, optional)
- `userIds` (`string[]`, optional) — Represents array of user ids which should be added/removed.

### `updateMemberships`

**Example:**

```typescript
    await client.projects.updateMemberships({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        memberships: [{
                costRate: {
                    amount: 20000,
                    since: "2020-01-01T00:00:00Z"
                },
                hourlyRate: {
                    amount: 20000,
                    since: "2020-01-01T00:00:00Z"
                },
                userId: "45b687e29ae1f428e7ebe123"
            }],
        userGroups: {
            contains: "CONTAINS",
            ids: ["67b687e29ae1f428e7ebe123"],
            status: "ACTIVE"
        }
    })
```

**Request fields** (`UpdateProjectMembershipsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `memberships` (`ClockifyApi.UserIdWithRatesRequest[]`, required) — Represents a list of users with id and rates request objects.
- `userGroups` (`ClockifyApi.ProjectsUserGroupIdsSchema`, optional)

### `updateTemplate`

**Example:**

```typescript
    await client.projects.updateTemplate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        isTemplate: false
    })
```

**Request fields** (`UpdateProjectTemplateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `isTemplate` (`boolean`, required) — Indicates whether project is a template or not.

### `updateUserCostRate`

**Example:**

```typescript
    await client.projects.updateUserCostRate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        userId: "4a0ab5acb07987125438b60f",
        body: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        }
    })
```

**Request fields** (`UpdateUserCostRateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.RateRequest`, required)

### `updateUserHourlyRate`

**Example:**

```typescript
    await client.projects.updateUserHourlyRate({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "5b641568b07987035750505e",
        userId: "4a0ab5acb07987125438b60f",
        body: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        }
    })
```

**Request fields** (`UpdateUserHourlyRateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.RateRequest`, required)

