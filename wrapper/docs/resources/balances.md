# balances

5 methods on `client.balances`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getBalancesForPolicy`

**Example:**

```typescript
    await client.balances.getBalancesForPolicy({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`GetBalancesForPolicyRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `sort` (`ClockifyApi.BalanceSortColumn`, optional) — If provided, the result is sorted by this column.
- `sort-order` (`ClockifyApi.BalanceSortOrder`, optional) — Sort results in ascending or descending order.

### `updateBalance`

**Example:**

```typescript
    await client.balances.updateBalance({
        workspaceId: "workspaceId",
        policyId: "policyId",
        note: "Bonus days added.",
        userIds: ["5b715448b079875110792222", "5b715448b079875110791111"],
        value: 22
    })
```

**Request fields** (`UpdateBalanceRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `note` (`string`, required) — Represents a new balance note value.
- `userIds` (`string[]`, required) — Represents the list of users' identifiers whose balance is to be updated.
- `value` (`number`, required) — Represents a new balance value.

### `getBalanceForUser`

**Example:**

```typescript
    await client.balances.getBalanceForUser({
        workspaceId: "workspaceId",
        userId: "userId"
    })
```

**Request fields** (`GetBalanceForUserRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `sort` (`ClockifyApi.BalanceSortColumn`, optional) — Sort result based on given criteria.
- `sort-order` (`ClockifyApi.BalanceSortOrder`, optional) — Sort result by providing sort order.

### `getWorkspacesWorkspaceIdTimeOffRequests`

**Example:**

```typescript
    await client.balances.getWorkspacesWorkspaceIdTimeOffRequests({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdTimeOffRequestsRequest`):

- `workspaceId` (`string`, required)

### `getWorkspacesWorkspaceIdUsersUserIdTimeOffBalances`

**Example:**

```typescript
    await client.balances.getWorkspacesWorkspaceIdUsersUserIdTimeOffBalances({
        workspaceId: "workspaceId",
        userId: "userId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdUsersUserIdTimeOffBalancesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)

