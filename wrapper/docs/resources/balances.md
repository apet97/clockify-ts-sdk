# balances

3 methods on `client.balances`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `listForPolicy`

**Request fields** (`ListForPolicyBalancesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `sort` (`ClockifyApi.BalanceSortColumn`, optional) — If provided, the result is sorted by this column.
- `sort-order` (`ClockifyApi.BalanceSortOrder`, optional) — Sort results in ascending or descending order.

### `update`

**Request fields** (`UpdateBalancesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `note` (`string`, required) — Represents a new balance note value.
- `userIds` (`string[]`, required) — Represents the list of users' identifiers whose balance is to be updated.
- `value` (`number`, required) — Represents a new balance value.
- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`UpdateBalancesRequestBody`, required)
- `note` (`string`, required) — Represents a new balance note value.
- `userIds` (`string[]`, required) — Represents the list of users' identifiers whose balance is to be updated.
- `value` (`number`, required) — Represents a new balance value.

### `getForUser`

**Request fields** (`GetForUserBalancesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `sort` (`ClockifyApi.BalanceSortColumn`, optional) — Sort result based on given criteria.
- `sort-order` (`ClockifyApi.BalanceSortOrder`, optional) — Sort result by providing sort order.

