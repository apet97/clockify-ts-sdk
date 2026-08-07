# balances

3 methods on `client.balances`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `listForPolicy`

**Request fields** (`ListForPolicyBalancesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `sort` (`ClockifyApi.BalanceSortColumn`, optional) — If provided, the result is sorted by this column.
- `sort-order` (`ClockifyApi.BalanceSortOrder`, optional) — Sort results in ascending or descending order.

### `update`

**Request fields** (`UpdateBalancesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `note` (`string`, required) — Represents a new balance note value.
- `userIds` (`string[]`, required) — Represents the list of users' identifiers whose balance is to be updated.
- `value` (`number`, required) — Represents a new balance value.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required) — Represents a policy identifier across the system.
- `body` (`UpdateBalancesRequestBody`, required)
- `note` (`string`, required) — Represents a new balance note value.
- `userIds` (`string[]`, required) — Represents the list of users' identifiers whose balance is to be updated.
- `value` (`number`, required) — Represents a new balance value.

### `getForUser`

**Request fields** (`GetForUserBalancesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `sort` (`ClockifyApi.BalanceSortColumn`, optional) — Sort result based on given criteria.
- `sort-order` (`ClockifyApi.BalanceSortOrder`, optional) — Sort result by providing sort order.

