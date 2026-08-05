# balanceAssignment

4 methods on `client.balanceAssignment`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `createBalanceAssignment`

**Request fields** (`CreateBalanceAssignmentBalanceAssignmentRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `balance` (`number`, required) — Represents the amount of balance to be created
- `dateRange` (`ClockifyApi.DateRangeV1Request`, optional)
- `note` (`string`, optional) — Represents note attached to updating balance.
- `policyId` (`string`, required) — Represents the identifier of the policy where the balance assignment will be created
- `userIds` (`string[]`, required) — Represents list of users' identifiers whose balance is to be updated.
- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `body` (`CreateBalanceAssignmentBalanceAssignmentRequestBody`, required)
- `balance` (`number`, required) — Represents the amount of balance to be created
- `dateRange` (`ClockifyApi.DateRangeV1Request`, optional)
- `note` (`string`, optional) — Represents note attached to updating balance.
- `policyId` (`string`, required) — Represents the identifier of the policy where the balance assignment will be created
- `userIds` (`string[]`, required) — Represents list of users' identifiers whose balance is to be updated.

### `updateBalanceAssignment`

**Request fields** (`UpdateBalanceAssignmentBalanceAssignmentRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `userId` (`string`, required) — Represents user identifier across the system.
- `policyId` (`string`, required) — Represents policy identifier across the system.
- `balanceAssignmentId` (`string`, required) — Represents balance assignment identifier across the system.
- `balanceChange` (`number`, required) — Represents the change in balance of the balance assignment
- `dateRange` (`ClockifyApi.DateRangeV1Request`, optional)
- `note` (`string`, optional) — Represents note attached to updating balance.
- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `userId` (`string`, required) — Represents user identifier across the system.
- `policyId` (`string`, required) — Represents policy identifier across the system.
- `balanceAssignmentId` (`string`, required) — Represents balance assignment identifier across the system.
- `body` (`UpdateBalanceAssignmentBalanceAssignmentRequestBody`, required)
- `balanceChange` (`number`, required) — Represents the change in balance of the balance assignment
- `dateRange` (`ClockifyApi.DateRangeV1Request`, optional)
- `note` (`string`, optional) — Represents note attached to updating balance.

### `deleteBalanceAssignment`

**Request fields** (`DeleteBalanceAssignmentBalanceAssignmentRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `userId` (`string`, required) — Represents user identifier across the system.
- `policyId` (`string`, required) — Represents policy identifier across the system.
- `balanceAssignmentId` (`string`, required) — Represents balance assignment identifier across the system.
- `note` (`string`, required) — Represents a note explaining balance deletion
- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `userId` (`string`, required) — Represents user identifier across the system.
- `policyId` (`string`, required) — Represents policy identifier across the system.
- `balanceAssignmentId` (`string`, required) — Represents balance assignment identifier across the system.
- `body` (`DeleteBalanceAssignmentBalanceAssignmentRequestBody`, required)
- `note` (`string`, required) — Represents a note explaining balance deletion

### `getBalanceAssignmentsForUserAndPolicy`

**Request fields** (`GetBalanceAssignmentsForUserAndPolicyBalanceAssignmentRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `userId` (`string`, required) — Represents user identifier across the system.
- `policyId` (`string`, required) — Represents policy identifier across the system.

