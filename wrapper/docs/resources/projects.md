# projects

15 methods on `client.projects`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional) — If provided, returns projects whose name contains the provided string.
- `strict-name-search` (`boolean`, optional) — When true, search by name returns only projects whose name exactly matches the name parameter.
- `archived` (`boolean`, optional) — If true, returns only archived projects. If omitted, returns both archived and non-archived projects.
- `billable` (`boolean`, optional) — If true, returns only billable projects. If omitted, returns both billable and non-billable projects.
- `clients` (`string[]`, optional) — If provided, returns projects that contain clients matching any provided ids.
- `contains-client` (`boolean`, optional) — Controls whether the clients filter includes or excludes matching client ids.
- `client-status` (`"ACTIVE" \| "ARCHIVED" \| "ALL"`, optional) — Filters projects based on client status.
- `users` (`string[]`, optional) — If provided, returns projects that contain users matching any provided ids.
- `contains-user` (`boolean`, optional) — Controls whether the users filter includes or excludes matching user ids.
- `user-status` (`"PENDING" \| "ACTIVE" \| "DECLINED" \| "INACTIVE" \| "ALL"`, optional) — Filters projects based on user status.
- `is-template` (`boolean`, optional) — Filters projects based on whether they are used as a template or not.
- `sort-column` (`"ID" \| "NAME" \| "CLIENT_NAME" \| "DURATION" \| "BUDGET" \| "PROGRESS"`, optional) — Sorts the results by the given column/field.
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional) — Sorting mode.
- `hydrated` (`boolean`, optional) — If true, results contain additional information about the project.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `access` (`"PUBLIC" \| "PRIVATE"`, optional) — If provided, returns projects that match the provided access.
- `expense-limit` (`number`, optional) — Represents the maximum number of expenses to fetch.
- `expense-date` (`string`, optional) — If provided, returns expenses dated before the provided yyyy-MM-dd date.
- `userGroups` (`string[]`, optional) — If provided, returns projects that contain groups matching any provided ids.
- `contains-group` (`boolean`, optional) — Controls whether the userGroups filter includes or excludes matching group ids.

### `create`

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
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`CreateProjectRequestBody`, required)
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

### `get`

**Request fields** (`GetProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `hydrated` (`boolean`, optional) — If true, results contain additional information about the project.
- `custom-field-entity-type` (`string`, optional) — Filters custom fields by custom field entity type.
- `expense-limit` (`number`, optional) — Represents the maximum number of expenses to fetch.
- `expense-date` (`string`, optional) — If provided, returns expenses dated before the provided yyyy-MM-dd date.

### `update`

**Request fields** (`UpdateProjectsRequest`):

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
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `body` (`UpdateProjectsRequestBody`, required)
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

**Request fields** (`DeleteProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.

### `archive`

**Request fields** (`ArchiveProjectsRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `archived` (`boolean`, optional)
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `body` (`ArchiveProjectsRequestBody`, required)
- `archived` (`boolean`, optional)

### `updateCostRate`

**Request fields** (`UpdateCostRateProjectsRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `amount` (`number`, required)
- `since` (`string`, optional)
- `sinceAsInstant` (`string`, optional)
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `body` (`UpdateCostRateProjectsRequestBody`, required)
- `amount` (`number`, required)
- `since` (`string`, optional)
- `sinceAsInstant` (`string`, optional)

### `updateEstimate`

**Request fields** (`UpdateEstimateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `budgetEstimate` (`ClockifyApi.EstimateWithOptionsRequest`, optional)
- `estimateReset` (`ClockifyApi.EstimateResetRequest`, optional)
- `timeEstimate` (`ClockifyApi.TimeEstimateRequest`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `body` (`UpdateEstimateProjectsRequestBody`, required)
- `budgetEstimate` (`ClockifyApi.EstimateWithOptionsRequest`, optional)
- `estimateReset` (`ClockifyApi.EstimateResetRequest`, optional)
- `timeEstimate` (`ClockifyApi.TimeEstimateRequest`, optional)

### `updateHourlyRate`

**Request fields** (`UpdateHourlyRateProjectsRequest`):

- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `amount` (`number`, required)
- `since` (`string`, optional)
- `sinceAsInstant` (`string`, optional)
- `workspaceId` (`string`, required)
- `projectId` (`string`, required)
- `body` (`UpdateHourlyRateProjectsRequestBody`, required)
- `amount` (`number`, required)
- `since` (`string`, optional)
- `sinceAsInstant` (`string`, optional)

### `setMembers`

**Request fields** (`SetMembersProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `remove` (`boolean`, optional) — Setting this flag to true will remove the given users from the project.
- `userGroups` (`ClockifyApi.ProjectsUserGroupIdsSchema`, optional)
- `userIds` (`string[]`, optional) — Represents array of user ids which should be added/removed.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `body` (`SetMembersProjectsRequestBody`, required)
- `remove` (`boolean`, optional) — Setting this flag to true will remove the given users from the project.
- `userGroups` (`ClockifyApi.ProjectsUserGroupIdsSchema`, optional)
- `userIds` (`string[]`, optional) — Represents array of user ids which should be added/removed.

### `updateMemberships`

**Request fields** (`UpdateMembershipsProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `memberships` (`ClockifyApi.UserIdWithRatesRequest[]`, required) — Represents a list of users with id and rates request objects.
- `userGroups` (`ClockifyApi.ProjectsUserGroupIdsSchema`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `body` (`UpdateMembershipsProjectsRequestBody`, required)
- `memberships` (`ClockifyApi.UserIdWithRatesRequest[]`, required) — Represents a list of users with id and rates request objects.
- `userGroups` (`ClockifyApi.ProjectsUserGroupIdsSchema`, optional)

### `updateTemplate`

**Request fields** (`UpdateTemplateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `isTemplate` (`boolean`, required) — Indicates whether project is a template or not.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `body` (`UpdateTemplateProjectsRequestBody`, required)
- `isTemplate` (`boolean`, required) — Indicates whether project is a template or not.

### `updateUserCostRate`

**Request fields** (`UpdateUserCostRateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`UpdateUserCostRateProjectsRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `updateUserHourlyRate`

**Request fields** (`UpdateUserHourlyRateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required) — Represents a project identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`UpdateUserHourlyRateProjectsRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `createFromTemplate`

**Request fields** (`CreateFromTemplateProjectsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `clientId` (`string`, optional) — Represents a client identifier across the system.
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `isPublic` (`boolean`, optional) — Indicates whether the project is public or not.
- `name` (`string`, required) — Represents a project name.
- `templateProjectId` (`string`, required) — Represents a project identifier across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`CreateFromTemplateProjectsRequestBody`, required)
- `clientId` (`string`, optional) — Represents a client identifier across the system.
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `isPublic` (`boolean`, optional) — Indicates whether the project is public or not.
- `name` (`string`, required) — Represents a project name.
- `templateProjectId` (`string`, required) — Represents a project identifier across the system.

