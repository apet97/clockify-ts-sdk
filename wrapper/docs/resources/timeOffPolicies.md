# timeOffPolicies

6 methods on `client.timeOffPolicies`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `page` (`string`, optional) — Page number.
- `page-size` (`number`, optional) — Page size.
- `name` (`string`, optional) — Filters policies to names that contain the provided string.
- `status` (`"ACTIVE" \| "ARCHIVED" \| "ALL"`, optional) — Filters policies by status.
- `sort-column` (`string`, optional) — Column to use for sorting policies.
- `sort-order` (`"ASCENDING" \| "DESCENDING"`, optional) — Sort order.

### `create`

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
- `icon` (`"UMBRELLA" \| "SNOWFLAKE" \| "FAMILY" \| "PLANE" \| "STETHOSCOPE" \| "HEALTH_METRICS" \| "CHILDCARE" \| "LUGGAGE" \| "MONETIZATION" \| "CALENDAR"`, optional) — Policy icon.
- `name` (`string`, required) — Represents a name of the new policy.
- `negativeBalance` (`ClockifyApi.NegativeBalanceRequest`, optional)
- `timeUnit` (`"DAYS" \| "HOURS"`, optional) — Indicates time unit of the policy.
- `userGroups` (`ClockifyApi.PoliciesUserGroupIdsSchema`, optional)
- `users` (`ClockifyApi.PoliciesUserIdsSchema`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`CreateTimeOffPolicyRequestBody`, required)
- `allowHalfDay` (`boolean`, optional) — Indicates whether policy allows half days.
- `allowNegativeBalance` (`boolean`, optional) — Indicates whether policy allows negative balances.
- `approve` (`ClockifyApi.PolicyApprovalDto`, required)
- `archived` (`boolean`, optional) — Indicates whether policy is archived.
- `automaticAccrual` (`ClockifyApi.AutomaticAccrualRequest`, optional)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Policy color as a hex RGB value.
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether policy is applied to future new users.
- `hasExpiration` (`boolean`, optional) — Indicates whether the policy balance should have expiration.
- `icon` (`"UMBRELLA" \| "SNOWFLAKE" \| "FAMILY" \| "PLANE" \| "STETHOSCOPE" \| "HEALTH_METRICS" \| "CHILDCARE" \| "LUGGAGE" \| "MONETIZATION" \| "CALENDAR"`, optional) — Policy icon.
- `name` (`string`, required) — Represents a name of the new policy.
- `negativeBalance` (`ClockifyApi.NegativeBalanceRequest`, optional)
- `timeUnit` (`"DAYS" \| "HOURS"`, optional) — Indicates time unit of the policy.
- `userGroups` (`ClockifyApi.PoliciesUserGroupIdsSchema`, optional)
- `users` (`ClockifyApi.PoliciesUserIdsSchema`, optional)

### `get`

**Request fields** (`GetTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)

### `update`

**Request fields** (`UpdateTimeOffPoliciesRequest`):

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
- `icon` (`"UMBRELLA" \| "SNOWFLAKE" \| "FAMILY" \| "PLANE" \| "STETHOSCOPE" \| "HEALTH_METRICS" \| "CHILDCARE" \| "LUGGAGE" \| "MONETIZATION" \| "CALENDAR"`, optional) — Policy icon.
- `name` (`string`, required) — Name to use for updating the policy.
- `negativeBalance` (`ClockifyApi.NegativeBalanceRequest`, optional)
- `userGroups` (`ClockifyApi.PoliciesUserGroupIdsSchema`, required)
- `users` (`ClockifyApi.PoliciesUserIdsSchema`, required)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)
- `body` (`UpdateTimeOffPoliciesRequestBody`, required)
- `allowHalfDay` (`boolean`, required) — Indicates whether policy allows half day.
- `allowNegativeBalance` (`boolean`, required) — Indicates whether policy allows negative balance.
- `approve` (`ClockifyApi.PolicyApprovalDto`, required)
- `archived` (`boolean`, required) — Indicates whether policy is archived.
- `automaticAccrual` (`ClockifyApi.AutomaticAccrualRequest`, optional)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Policy color as a hex RGB value.
- `everyoneIncludingNew` (`boolean`, required) — Indicates whether the policy is shown to new users.
- `hasExpiration` (`boolean`, required) — Indicates whether the policy has expiration.
- `icon` (`"UMBRELLA" \| "SNOWFLAKE" \| "FAMILY" \| "PLANE" \| "STETHOSCOPE" \| "HEALTH_METRICS" \| "CHILDCARE" \| "LUGGAGE" \| "MONETIZATION" \| "CALENDAR"`, optional) — Policy icon.
- `name` (`string`, required) — Name to use for updating the policy.
- `negativeBalance` (`ClockifyApi.NegativeBalanceRequest`, optional)
- `userGroups` (`ClockifyApi.PoliciesUserGroupIdsSchema`, required)
- `users` (`ClockifyApi.PoliciesUserIdsSchema`, required)

### `updateStatus`

**Request fields** (`UpdateStatusTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)
- `status` (`"ACTIVE" \| "ARCHIVED" \| "ALL"`, required) — Status to use for changing the policy.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)
- `body` (`UpdateStatusTimeOffPoliciesRequestBody`, required)
- `status` (`"ACTIVE" \| "ARCHIVED" \| "ALL"`, required) — Status to use for changing the policy.

### `delete`

**Request fields** (`DeleteTimeOffPoliciesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `policyId` (`string`, required)

