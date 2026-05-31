# timeOff

8 methods on `client.timeOff`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `submit`

**Request fields** (`SubmitTimeOffRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `note` (`string`, required) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)
- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`SubmitTimeOffRequestBody`, required)
- `note` (`string`, required) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)

### `changeTimeOffRequestStatus`

**Request fields** (`ChangeTimeOffRequestStatusTimeOffRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)
- `note` (`string`, required) — Provide the note you would like to use for changing the time off request.
- `status` (`"APPROVED" \| "REJECTED"`, required) — Provide the status you would like to use for changing the time off request.
- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)
- `body` (`ChangeTimeOffRequestStatusTimeOffRequestBody`, required)
- `note` (`string`, required) — Provide the note you would like to use for changing the time off request.
- `status` (`"APPROVED" \| "REJECTED"`, required) — Provide the status you would like to use for changing the time off request.

### `withdraw`

**Request fields** (`WithdrawTimeOffRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)

### `submitForUser`

**Request fields** (`SubmitForUserTimeOffRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `userId` (`string`, required)
- `note` (`string`, required) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)
- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `userId` (`string`, required)
- `body` (`SubmitForUserTimeOffRequestBody`, required)
- `note` (`string`, required) — Provide the note you would like to use for creating the time off request.
- `timeOffPeriod` (`ClockifyApi.TimeOffRequestPeriodV1Request`, required)

### `list`

**Request fields** (`ListTimeOffRequest`):

- `workspaceId` (`string`, required)
- `end` (`string`, optional) — Return time off requests created before the specified time in requester's time zone. Provide end in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `start` (`string`, optional) — Return time off requests created after the specified time in requester's time zone. Provide start in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `statuses` (`ClockifyApi.RequestStatusType[]`, optional) — Filters time off requests by status.
- `userGroups` (`string[]`, optional) — Provide the user group ids of time off requests.
- `users` (`string[]`, optional) — Provide the user ids of time off requests. If empty, will return time off requests of all users (with a maximum of 5000 users).
- `workspaceId` (`string`, required)
- `body` (`ListTimeOffRequestBody`, required)
- `end` (`string`, optional) — Return time off requests created before the specified time in requester's time zone. Provide end in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `start` (`string`, optional) — Return time off requests created after the specified time in requester's time zone. Provide start in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `statuses` (`ClockifyApi.RequestStatusType[]`, optional) — Filters time off requests by status.
- `userGroups` (`string[]`, optional) — Provide the user group ids of time off requests.
- `users` (`string[]`, optional) — Provide the user ids of time off requests. If empty, will return time off requests of all users (with a maximum of 5000 users).

### `get`

**Request fields** (`GetTimeOffRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)

### `delete`

**Request fields** (`DeleteTimeOffRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)

### `updateStatus`

**Request fields** (`UpdateStatusTimeOffRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)
- `note` (`string`, optional)
- `statusType` (`"APPROVED" \| "REJECTED" \| "WITHDRAWN"`, optional)
- `workspaceId` (`string`, required)
- `requestId` (`string`, required)
- `body` (`UpdateStatusTimeOffRequestBody`, required)
- `note` (`string`, optional)
- `statusType` (`"APPROVED" \| "REJECTED" \| "WITHDRAWN"`, optional)

