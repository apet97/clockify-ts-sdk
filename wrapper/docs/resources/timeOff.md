# timeOff

8 methods on `client.timeOff`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `submit`

**Example:**

```typescript
    await client.timeOff.submit({
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

**Request fields** (`SubmitTimeOffRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`ClockifyApi.CreateTimeOffRequest`, required)

### `withdraw`

**Example:**

```typescript
    await client.timeOff.withdraw({
        workspaceId: "workspaceId",
        policyId: "policyId",
        requestId: "requestId"
    })
```

**Request fields** (`WithdrawTimeOffRequest`):

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

### `submitForUser`

**Example:**

```typescript
    await client.timeOff.submitForUser({
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

**Request fields** (`SubmitForUserTimeOffRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `userId` (`string`, required)
- `body` (`ClockifyApi.CreateTimeOffRequest`, required)

### `list`

**Example:**

```typescript
    await client.timeOff.list({
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

### `get`

**Example:**

```typescript
    await client.timeOff.get({
        workspaceId: "workspaceId",
        requestId: "requestId"
    })
```

**Request fields** (`GetTimeOffRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)

### `delete`

**Example:**

```typescript
    await client.timeOff.delete({
        workspaceId: "workspaceId",
        requestId: "requestId"
    })
```

**Request fields** (`DeleteTimeOffRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)

### `updateStatus`

**Example:**

```typescript
    await client.timeOff.updateStatus({
        workspaceId: "workspaceId",
        requestId: "requestId"
    })
```

**Request fields** (`UpdateStatusTimeOffRequest`):

- `workspaceId` (`string`, required)
- `requestId` (`string`, required)
- `note` (`string`, optional)
- `statusType` (`UpdateStatusTimeOffRequest.StatusType`, optional)

