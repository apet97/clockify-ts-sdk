# timeOff

12 methods on `client.timeOff`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `postWorkspacesWorkspaceIdPoliciesPolicyIdRequests`

**Example:**

```typescript
    await client.timeOff.postWorkspacesWorkspaceIdPoliciesPolicyIdRequests({
        workspaceId: "workspaceId",
        policyId: "policyId",
        timeOffPeriod: {
            period: {
                end: "2026-07-13T10:00:00Z",
                start: "2026-07-13T09:00:00Z"
            }
        }
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `note` (`string`, optional)
- `timeOffPeriod` (`PostWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequest.TimeOffPeriod`, required)

### `deleteWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestId`

**Example:**

```typescript
    await client.timeOff.deleteWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestId({
        workspaceId: "workspaceId",
        policyId: "policyId",
        requestId: "requestId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestIdRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)

### `patchWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestId`

**Example:**

```typescript
    await client.timeOff.patchWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestId({
        workspaceId: "workspaceId",
        policyId: "policyId",
        requestId: "requestId",
        statusType: "APPROVED"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestIdRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)
- `note` (`string`, optional)
- `statusType` (`PatchWorkspacesWorkspaceIdPoliciesPolicyIdRequestsRequestIdRequest.StatusType`, required)

### `createTimeOffRequest`

**Example:**

```typescript
    await client.timeOff.createTimeOffRequest({
        workspaceId: "workspaceId",
        policyId: "policyId",
        body: {
            note: "Create Time Off Note",
            timeOffPeriod: {
                halfDayPeriod: "NOT_DEFINED",
                isHalfDay: false,
                period: {
                    days: 1,
                    end: "2022-08-26",
                    start: "2022-08-26"
                }
            }
        }
    })
```

**Request fields** (`CreateTimeOffRequestRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`ClockifyApi.CreateTimeOffRequest`, required)

### `deleteTimeOffRequest`

**Example:**

```typescript
    await client.timeOff.deleteTimeOffRequest({
        workspaceId: "workspaceId",
        policyId: "policyId",
        requestId: "requestId"
    })
```

**Request fields** (`DeleteTimeOffRequestRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)

### `changeTimeOffRequestStatus`

**Example:**

```typescript
    await client.timeOff.changeTimeOffRequestStatus({
        workspaceId: "workspaceId",
        policyId: "policyId",
        requestId: "requestId",
        note: "Time Off Request Note",
        status: "APPROVED"
    })
```

**Request fields** (`ChangeTimeOffRequestStatusRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `requestId` (`string`, required)
- `note` (`string`, required) — Provide the note you would like to use for changing the time off request.
- `status` (`ChangeTimeOffRequestStatusRequest.Status`, required) — Provide the status you would like to use for changing the time off request.

### `createTimeOffRequestForUser`

**Example:**

```typescript
    await client.timeOff.createTimeOffRequestForUser({
        workspaceId: "workspaceId",
        policyId: "policyId",
        userId: "userId",
        body: {
            note: "Create Time Off Note",
            timeOffPeriod: {
                halfDayPeriod: "NOT_DEFINED",
                isHalfDay: false,
                period: {
                    days: 1,
                    end: "2022-08-26",
                    start: "2022-08-26"
                }
            }
        }
    })
```

**Request fields** (`CreateTimeOffRequestForUserRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `userId` (`string`, required)
- `body` (`ClockifyApi.CreateTimeOffRequest`, required)

### `getAllTimeOffRequestsOnWorkspace`

**Example:**

```typescript
    await client.timeOff.getAllTimeOffRequestsOnWorkspace({
        workspaceId: "workspaceId",
        end: "2022-08-26T23:55:06Z",
        page: 1,
        pageSize: 50,
        start: "2022-08-26T08:00:06Z",
        statuses: ["APPROVED", "PENDING"],
        userGroups: ["5b715612b079875110791342", "5b715612b079875110791324", "5b715612b079875110793142"],
        users: ["5b715612b079875110791432", "b715612b079875110791234"]
    })
```

**Request fields** (`TimeOffRequestSearchRequest`):

- `workspaceId` (`string`, required)
- `end` (`string`, optional) — Return time off requests created before the specified time in requester's time zone. Provide end in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `page` (`number`, optional) — Page number.
- `pageSize` (`number`, optional) — Page size.
- `start` (`string`, optional) — Return time off requests created after the specified time in requester's time zone. Provide start in format YYYY-MM-DDTHH:MM:SS.ssssssZ
- `statuses` (`ClockifyApi.RequestStatusType[]`, optional) — Filters time off requests by status.
- `userGroups` (`string[]`, optional) — Provide the user group ids of time off requests.
- `users` (`string[]`, optional) — Provide the user ids of time off requests. If empty, will return time off requests of all users (with a maximum of 5000 users).

### `postWorkspacesWorkspaceIdTimeOffRequestsUsersUserId`

**Example:**

```typescript
    await client.timeOff.postWorkspacesWorkspaceIdTimeOffRequestsUsersUserId({
        workspaceId: "workspaceId",
        userId: "userId",
        policyId: "policyId",
        timeOffPeriod: {
            period: {}
        }
    })
```

**Request fields** (`TimeOffRequestCreate`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `note` (`string`, optional)
- `policyId` (`string`, required)
- `timeOffPeriod` (`TimeOffRequestCreate.TimeOffPeriod`, required)

### `getWorkspacesWorkspaceIdTimeOffRequestsRequestId`

**Example:**

```typescript
    await client.timeOff.getWorkspacesWorkspaceIdTimeOffRequestsRequestId({
        workspaceId: "workspaceId",
        requestId: "requestId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdTimeOffRequestsRequestIdRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)

### `deleteWorkspacesWorkspaceIdTimeOffRequestsRequestId`

**Example:**

```typescript
    await client.timeOff.deleteWorkspacesWorkspaceIdTimeOffRequestsRequestId({
        workspaceId: "workspaceId",
        requestId: "requestId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdTimeOffRequestsRequestIdRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)

### `patchWorkspacesWorkspaceIdTimeOffRequestsRequestIdStatus`

**Example:**

```typescript
    await client.timeOff.patchWorkspacesWorkspaceIdTimeOffRequestsRequestIdStatus({
        workspaceId: "workspaceId",
        requestId: "requestId"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdTimeOffRequestsRequestIdStatusRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)
- `note` (`string`, optional)
- `statusType` (`PatchWorkspacesWorkspaceIdTimeOffRequestsRequestIdStatusRequest.StatusType`, optional)

