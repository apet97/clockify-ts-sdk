# timeOffPolicies

6 methods on `client.timeOffPolicies`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.timeOffPolicies.list({
        workspaceId: "60f91b3ffdaf031696ec61a8",
        name: "Holidays"
    })
```

**Request fields** (`ListTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `page` (`string`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `name` (`string`, optional) — Filters policies to names that contain the provided string.
- `status` (`ClockifyApi.ListTimeOffPoliciesRequestStatus`, optional) — Filters policies by status.
- `sort-column` (`string`, optional) — Column to use for sorting policies.
- `sort-order` (`ClockifyApi.ListTimeOffPoliciesRequestSortOrder`, optional) — Sort order.

### `create`

**Example:**

```typescript
    await client.timeOffPolicies.create({
        workspaceId: "60f91b3ffdaf031696ec61a8",
        allowHalfDay: false,
        allowNegativeBalance: true,
        approve: {
            requiresApproval: true,
            specificMembers: false,
            teamManagers: true,
            userIds: ["5b715612b079875110791432"]
        },
        archived: true,
        automaticAccrual: {
            amount: 1.5,
            period: "MONTH",
            timeUnit: "DAYS"
        },
        automaticTimeEntryCreation: {
            defaultEntities: {
                projectId: "65b36d3c525e243c48f9150f",
                taskId: "65b36d46fa3df8607e42d21a"
            },
            enabled: true
        },
        color: "#8BC34A",
        everyoneIncludingNew: false,
        hasExpiration: false,
        icon: "UMBRELLA",
        name: "Mental health days",
        negativeBalance: {
            amount: 3,
            amountValidForTimeUnit: true,
            period: "YEAR",
            shouldReset: true,
            timeUnit: "DAYS"
        },
        timeUnit: "DAYS",
        userGroups: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791342"],
            status: "ACTIVE"
        },
        users: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791432"],
            status: "ACTIVE"
        }
    })
```

**Request fields** (`CreateTimeOffPolicyRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `allowHalfDay` (`boolean`, optional) — Indicates whether policy allows half days.
- `allowNegativeBalance` (`boolean`, optional) — Indicates whether policy allows negative balances.
- `approve` (`ClockifyApi.PolicyApprovalDto`, required)
- `archived` (`boolean`, optional) — Indicates whether policy is archived.
- `automaticAccrual` (`ClockifyApi.AutomaticAccrualRequest`, optional)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Policy color as a hex RGB value.
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether policy is applied to future new users.
- `hasExpiration` (`boolean`, optional) — Indicates whether the policy balance should have expiration.
- `icon` (`CreateTimeOffPolicyRequest.Icon`, optional) — Policy icon.
- `name` (`string`, required) — Represents a name of the new policy.
- `negativeBalance` (`ClockifyApi.NegativeBalanceRequest`, optional)
- `timeUnit` (`CreateTimeOffPolicyRequest.TimeUnit`, optional) — Indicates time unit of the policy.
- `userGroups` (`ClockifyApi.PoliciesUserGroupIdsSchema`, optional)
- `users` (`ClockifyApi.PoliciesUserIdsSchema`, optional)

### `get`

**Example:**

```typescript
    await client.timeOffPolicies.get({
        workspaceId: "60f91b3ffdaf031696ec61a8",
        policyId: "policyId"
    })
```

**Request fields** (`GetTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.timeOffPolicies.update({
        workspaceId: "60f91b3ffdaf031696ec61a8",
        policyId: "policyId",
        allowHalfDay: false,
        allowNegativeBalance: true,
        approve: {
            requiresApproval: true,
            specificMembers: false,
            teamManagers: true,
            userIds: ["5b715612b079875110791432"]
        },
        archived: false,
        automaticAccrual: {
            amount: 1.5,
            period: "MONTH",
            timeUnit: "DAYS"
        },
        automaticTimeEntryCreation: {
            defaultEntities: {
                projectId: "65b36d3c525e243c48f9150f",
                taskId: "65b36d46fa3df8607e42d21a"
            },
            enabled: true
        },
        color: "#8BC34A",
        everyoneIncludingNew: false,
        hasExpiration: false,
        icon: "UMBRELLA",
        name: "Vacation days",
        negativeBalance: {
            amount: 3,
            amountValidForTimeUnit: true,
            period: "YEAR",
            shouldReset: true,
            timeUnit: "DAYS"
        },
        userGroups: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791342"],
            status: "ACTIVE"
        },
        users: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791432"],
            status: "ACTIVE"
        }
    })
```

**Request fields** (`UpdateTimeOffPolicyRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)
- `allowHalfDay` (`boolean`, required) — Indicates whether policy allows half day.
- `allowNegativeBalance` (`boolean`, required) — Indicates whether policy allows negative balance.
- `approve` (`ClockifyApi.PolicyApprovalDto`, required)
- `archived` (`boolean`, required) — Indicates whether policy is archived.
- `automaticAccrual` (`ClockifyApi.AutomaticAccrualRequest`, optional)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Policy color as a hex RGB value.
- `everyoneIncludingNew` (`boolean`, required) — Indicates whether the policy is shown to new users.
- `hasExpiration` (`boolean`, required) — Indicates whether the policy has expiration.
- `icon` (`UpdateTimeOffPolicyRequest.Icon`, optional) — Policy icon.
- `name` (`string`, required) — Name to use for updating the policy.
- `negativeBalance` (`ClockifyApi.NegativeBalanceRequest`, optional)
- `userGroups` (`ClockifyApi.PoliciesUserGroupIdsSchema`, required)
- `users` (`ClockifyApi.PoliciesUserIdsSchema`, required)

### `delete`

**Example:**

```typescript
    await client.timeOffPolicies.delete({
        workspaceId: "60f91b3ffdaf031696ec61a8",
        policyId: "policyId"
    })
```

**Request fields** (`DeleteTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)

### `updateStatus`

**Example:**

```typescript
    await client.timeOffPolicies.updateStatus({
        workspaceId: "60f91b3ffdaf031696ec61a8",
        policyId: "policyId",
        status: "ACTIVE"
    })
```

**Request fields** (`PolicyStatusChangeRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)
- `status` (`PolicyStatusChangeRequest.Status`, required) — Status to use for changing the policy.

