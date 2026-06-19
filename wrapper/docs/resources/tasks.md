# tasks

7 methods on `client.tasks`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `name` (`string`, optional) — If provided, you'll get a filtered list of tasks that matches the provided string in their name.
- `strict-name-search` (`boolean`, optional) — Flag to toggle strict search mode. When true, search by name returns only exact matches.
- `is-active` (`boolean`, optional) — Filters search results whether task is active or not.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `create`

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
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `body` (`TaskCreateRequestBody`, required)
- `assigneeId` (`string`, optional) — Deprecated task assignee identifier.
- `assigneeIds` (`string[]`, optional) — Represents list of assignee ids for the task.
- `budgetEstimate` (`number`, optional) — Represents a task budget estimate as long.
- `estimate` (`string`, optional) — Represents a task duration estimate in ISO-8601 format.
- `id` (`string`, optional) — Represents task identifier across the system.
- `name` (`string`, required) — Represents task name.
- `status` (`ClockifyApi.TaskStatus`, optional)
- `userGroupIds` (`string[]`, optional) — Represents list of user group ids for the task.

### `get`

**Request fields** (`GetTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)

### `update`

**Request fields** (`UpdateTasksRequest`):

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
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `body` (`UpdateTasksRequestBody`, required)
- `assigneeId` (`string`, optional) — Deprecated task assignee identifier.
- `assigneeIds` (`string[]`, optional) — Represents list of assignee ids for the task.
- `billable` (`boolean`, optional) — Indicates whether a task is billable or not.
- `budgetEstimate` (`number`, optional) — Represents a task budget estimate as integer.
- `estimate` (`string`, optional) — Represents a task duration estimate.
- `name` (`string`, required) — Represents task name.
- `status` (`ClockifyApi.TaskStatus`, optional)
- `userGroupIds` (`string[]`, optional) — Represents list of user group ids for the task.

### `delete`

**Request fields** (`DeleteTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)

### `updateCostRate`

**Request fields** (`UpdateCostRateTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `body` (`UpdateCostRateTasksRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `updateBillableRate`

**Request fields** (`UpdateBillableRateTasksRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `taskId` (`string`, required)
- `body` (`UpdateBillableRateTasksRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

