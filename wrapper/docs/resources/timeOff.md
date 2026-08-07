# timeOff

5 methods on `client.timeOff`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `submit`

**Request fields** (`SubmitTimeOffRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `note` (`string`, optional) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `body` (`SubmitTimeOffRequestBody`, required)
- `note` (`string`, optional) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)

### `changeTimeOffRequestStatus`

**Request fields** (`ChangeTimeOffRequestStatusTimeOffRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `requestId` (`string`, required) — Represents a time off request identifier across the system.
- `note` (`string`, optional) — Provide the note you would like to use for changing the time off request.
- `status` (`"APPROVED" \| "REJECTED"`, required) — Provide the status you would like to use for changing the time off request.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `requestId` (`string`, required) — Represents a time off request identifier across the system.
- `body` (`ChangeTimeOffRequestStatusTimeOffRequestBody`, required)
- `note` (`string`, optional) — Provide the note you would like to use for changing the time off request.
- `status` (`"APPROVED" \| "REJECTED"`, required) — Provide the status you would like to use for changing the time off request.

### `withdraw`

**Request fields** (`WithdrawTimeOffRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `requestId` (`string`, required) — Represents a time off request identifier across the system.

### `submitForUser`

**Request fields** (`SubmitForUserTimeOffRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `note` (`string`, optional) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`SubmitForUserTimeOffRequestBody`, required)
- `note` (`string`, optional) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)

### `list`

**Request fields** (`ListTimeOffRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `end` (`string`, optional) — Return time off requests created before the specified time in requester's time zone. Provide end in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `start` (`string`, optional) — Return time off requests created after the specified time in requester's time zone. Provide start in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `statuses` (`ClockifyApi.RequestStatusType[]`, optional) — Filters time off requests by status.
- `userGroups` (`string[]`, optional) — Provide the user group ids of time off requests.
- `users` (`string[]`, optional) — Provide the user ids of time off requests. If empty, will return time off requests of all users (with a maximum of 5000 users).
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ListTimeOffRequestBody`, required)
- `end` (`string`, optional) — Return time off requests created before the specified time in requester's time zone. Provide end in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `start` (`string`, optional) — Return time off requests created after the specified time in requester's time zone. Provide start in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `statuses` (`ClockifyApi.RequestStatusType[]`, optional) — Filters time off requests by status.
- `userGroups` (`string[]`, optional) — Provide the user group ids of time off requests.
- `users` (`string[]`, optional) — Provide the user ids of time off requests. If empty, will return time off requests of all users (with a maximum of 5000 users).

