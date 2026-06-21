# approvals

6 methods on `client.approvals`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `status` (`ClockifyApi.ApprovalRequestFilterState`, optional) — Filters results based on the provided approval state.
- `sort-column` (`ClockifyApi.ApprovalRequestSortColumn`, optional) — Column name to use as sorting criteria.
- `sort-order` (`ClockifyApi.SortOrder`, optional) — Represents the sorting order.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.

### `submit`

**Request fields** (`SubmitApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`SubmitApprovalsRequestBody`, required)
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.

### `updateStatus`

**Request fields** (`UpdateStatusApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `approvalRequestId` (`string`, required) — Represents an approval request identifier across the system.
- `note` (`string`, optional) — Additional notes for the approval request.
- `state` (`ClockifyApi.ApprovalRequestState`, required)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `approvalRequestId` (`string`, required) — Represents an approval request identifier across the system.
- `body` (`UpdateStatusApprovalsRequestBody`, required)
- `note` (`string`, optional) — Additional notes for the approval request.
- `state` (`ClockifyApi.ApprovalRequestState`, required)

### `resubmit`

**Request fields** (`ResubmitApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ResubmitApprovalsRequestBody`, required)
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.

### `submitForUser`

**Request fields** (`SubmitForUserApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`SubmitForUserApprovalsRequestBody`, required)
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.

### `resubmitForUser`

**Request fields** (`ResubmitForUserApprovalsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`ResubmitForUserApprovalsRequestBody`, required)
- `period` (`ClockifyApi.ApprovalPeriod`, required)
- `periodStart` (`string`, required) — Approval period start date in yyyy-MM-ddThh:mm:ssZ format.

