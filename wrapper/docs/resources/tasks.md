# tasks

7 methods on `client.tasks`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.tasks.list({
        workspaceId: "workspaceId",
        projectId: "projectId",
        name: "Bugfixing"
    })
```

**Request fields** (`ListTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `name` (`string`, optional) — If provided, you'll get a filtered list of tasks that matches the provided string in their name.
- `strict-name-search` (`boolean`, optional) — Flag to toggle strict search mode. When true, search by name returns only exact matches.
- `is-active` (`boolean`, optional) — Filters search results whether task is active or not.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

**Example:**

```typescript
    await client.tasks.create({
        workspaceId: "workspaceId",
        projectId: "projectId",
        assigneeIds: ["45b687e29ae1f428e7ebe123", "67s687e29ae1f428e7ebe678"],
        budgetEstimate: 10000,
        estimate: "PT1H30M",
        id: "57a687e29ae1f428e7ebe107",
        name: "Bugfixing",
        status: "DONE",
        userGroupIds: ["67b687e29ae1f428e7ebe123", "12s687e29ae1f428e7ebe678"]
    })
```

**Request fields** (`TaskCreateRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `assigneeId` (`string`, optional) — Deprecated task assignee identifier.
- `assigneeIds` (`string[]`, optional) — Represents list of assignee ids for the task.
- `budgetEstimate` (`number`, optional) — Represents a task budget estimate as long.
- `estimate` (`string`, optional) — Represents a task duration estimate in ISO-8601 format.
- `id` (`string`, optional) — Represents task identifier across the system.
- `name` (`string`, required) — Represents task name.
- `status` (`ClockifyApi.TaskStatus`, optional)
- `userGroupIds` (`string[]`, optional) — Represents list of user group ids for the task.

### `get`

**Example:**

```typescript
    await client.tasks.get({
        workspaceId: "workspaceId",
        projectId: "projectId",
        taskId: "taskId"
    })
```

**Request fields** (`GetTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.tasks.update({
        workspaceId: "workspaceId",
        projectId: "projectId",
        taskId: "taskId",
        assigneeIds: ["45b687e29ae1f428e7ebe123", "67s687e29ae1f428e7ebe678"],
        billable: false,
        budgetEstimate: 10000,
        estimate: "PT1H30M",
        name: "Bugfixing",
        status: "DONE",
        userGroupIds: ["67b687e29ae1f428e7ebe123", "12s687e29ae1f428e7ebe678"]
    })
```

**Request fields** (`TaskUpdateRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `assigneeId` (`string`, optional) — Deprecated task assignee identifier.
- `assigneeIds` (`string[]`, optional) — Represents list of assignee ids for the task.
- `billable` (`boolean`, optional) — Indicates whether a task is billable or not.
- `budgetEstimate` (`number`, optional) — Represents a task budget estimate as integer.
- `estimate` (`string`, optional) — Represents a task duration estimate.
- `name` (`string`, required) — Represents task name.
- `status` (`ClockifyApi.TaskStatus`, optional)
- `userGroupIds` (`string[]`, optional) — Represents list of user group ids for the task.

### `delete`

**Example:**

```typescript
    await client.tasks.delete({
        workspaceId: "workspaceId",
        projectId: "projectId",
        taskId: "taskId"
    })
```

**Request fields** (`DeleteTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)

### `updateTaskCostRate`

**Example:**

```typescript
    await client.tasks.updateTaskCostRate({
        workspaceId: "workspaceId",
        projectId: "projectId",
        taskId: "taskId",
        body: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        }
    })
```

**Request fields** (`UpdateTaskCostRateRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `body` (`ClockifyApi.RateUpdateRequest`, required)

### `updateTaskBillableRate`

**Example:**

```typescript
    await client.tasks.updateTaskBillableRate({
        workspaceId: "workspaceId",
        projectId: "projectId",
        taskId: "taskId",
        body: {
            amount: 20000,
            since: "2020-01-01T00:00:00Z"
        }
    })
```

**Request fields** (`UpdateTaskBillableRateRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `body` (`ClockifyApi.RateUpdateRequest`, required)

