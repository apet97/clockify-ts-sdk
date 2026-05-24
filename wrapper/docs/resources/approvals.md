# approvals

6 methods on `client.approvals`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.approvals.list({
        workspaceId: "64a687e29ae1f428e7ebe303"
    })
```

**Request fields** (`ListApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `status` (`ClockifyApi.ApprovalRequestFilterState`, optional) — Filters results based on the provided approval state.
- `sort-column` (`ClockifyApi.ApprovalRequestSortColumn`, optional) — Column name to use as sorting criteria.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `submit`

**Example:**

```typescript
    await client.approvals.submit({
        workspaceId: "64a687e29ae1f428e7ebe303",
        body: {
            period: "MONTHLY",
            periodStart: "2020-01-01T00:00:00.000Z"
        }
    })
```

**Request fields** (`SubmitApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ClockifyApi.SubmitApprovalRequestRequest`, required)

### `resubmit`

**Example:**

```typescript
    await client.approvals.resubmit({
        workspaceId: "64a687e29ae1f428e7ebe303",
        body: {
            period: "MONTHLY",
            periodStart: "2020-01-01T00:00:00.000Z"
        }
    })
```

**Request fields** (`ResubmitApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ClockifyApi.SubmitApprovalRequestRequest`, required)

### `submitForUser`

**Example:**

```typescript
    await client.approvals.submitForUser({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        body: {
            period: "MONTHLY",
            periodStart: "2020-01-01T00:00:00.000Z"
        }
    })
```

**Request fields** (`SubmitForUserApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.SubmitApprovalRequestRequest`, required)

### `resubmitForUser`

**Example:**

```typescript
    await client.approvals.resubmitForUser({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        body: {
            period: "MONTHLY",
            periodStart: "2020-01-01T00:00:00.000Z"
        }
    })
```

**Request fields** (`ResubmitForUserApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ClockifyApi.SubmitApprovalRequestRequest`, required)

### `updateStatus`

**Example:**

```typescript
    await client.approvals.updateStatus({
        workspaceId: "64a687e29ae1f428e7ebe303",
        approvalRequestId: "940ab5acb07987125438b65y",
        note: "Approved after review.",
        state: "APPROVED"
    })
```

**Request fields** (`UpdateApprovalRequestRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `approvalRequestId` (`string`, required) — Represents an approval request identifier across the system.
- `note` (`string`, optional) — Additional notes for the approval request.
- `state` (`ClockifyApi.ApprovalRequestState`, required)

