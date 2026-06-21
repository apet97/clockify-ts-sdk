# policies

6 methods on `client.policies`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `list`

**Request fields** (`ListPoliciesRequest`):

- `workspaceId` (`string`, required)
- `archived` (`boolean`, optional)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `create`

**Request fields** (`TimeOffPolicy`):

- `workspaceId` (`string`, required)
- `accountingPeriod` (`Record<string, unknown> \| null`, optional)
- `allowHalfDay` (`boolean`, optional)
- `allowNegativeBalance` (`boolean`, optional)
- `amount` (`number`, optional)
- `approve` (`Record<string, unknown>`, optional)
- `archived` (`boolean`, optional)
- `automaticAccrual` (`Record<string, unknown> \| null`, optional)
- `carryOver` (`Record<string, unknown> \| null`, optional)
- `color` (`string`, optional)
- `everyoneIncludingNew` (`boolean`, optional)
- `id` (`string`, optional)
- `name` (`string`, optional)
- `negativeBalance` (`Record<string, unknown> \| null`, optional)
- `timeUnit` (`"DAYS" \| "HOURS"`, optional)
- `userAllowanceType` (`string \| null`, optional)
- `userGroups` (`Record<string, unknown>`, optional)
- `users` (`Record<string, unknown>`, optional)
- `workspaceId` (`string`, required)
- `body` (`TimeOffPolicyBody`, required)
- `accountingPeriod` (`Record<string, unknown> \| null`, optional)
- `allowHalfDay` (`boolean`, optional)
- `allowNegativeBalance` (`boolean`, optional)
- `amount` (`number`, optional)
- `approve` (`Record<string, unknown>`, optional)
- `archived` (`boolean`, optional)
- `automaticAccrual` (`Record<string, unknown> \| null`, optional)
- `carryOver` (`Record<string, unknown> \| null`, optional)
- `color` (`string`, optional)
- `everyoneIncludingNew` (`boolean`, optional)
- `id` (`string`, optional)
- `name` (`string`, optional)
- `negativeBalance` (`Record<string, unknown> \| null`, optional)
- `timeUnit` (`"DAYS" \| "HOURS"`, optional)
- `userAllowanceType` (`string \| null`, optional)
- `userGroups` (`Record<string, unknown>`, optional)
- `users` (`Record<string, unknown>`, optional)
- `workspaceId` (`string`, optional)

### `get`

**Request fields** (`GetPoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)

### `update`

**Request fields** (`UpdatePoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `accountingPeriod` (`Record<string, unknown> \| null`, optional)
- `allowHalfDay` (`boolean`, optional)
- `allowNegativeBalance` (`boolean`, optional)
- `amount` (`number`, optional)
- `approve` (`Record<string, unknown>`, optional)
- `archived` (`boolean`, optional)
- `automaticAccrual` (`Record<string, unknown> \| null`, optional)
- `carryOver` (`Record<string, unknown> \| null`, optional)
- `color` (`string`, optional)
- `everyoneIncludingNew` (`boolean`, optional)
- `id` (`string`, optional)
- `name` (`string`, optional)
- `negativeBalance` (`Record<string, unknown> \| null`, optional)
- `timeUnit` (`"DAYS" \| "HOURS"`, optional)
- `userAllowanceType` (`string \| null`, optional)
- `userGroups` (`Record<string, unknown>`, optional)
- `users` (`Record<string, unknown>`, optional)
- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`UpdatePoliciesRequestBody`, required)
- `accountingPeriod` (`Record<string, unknown> \| null`, optional)
- `allowHalfDay` (`boolean`, optional)
- `allowNegativeBalance` (`boolean`, optional)
- `amount` (`number`, optional)
- `approve` (`Record<string, unknown>`, optional)
- `archived` (`boolean`, optional)
- `automaticAccrual` (`Record<string, unknown> \| null`, optional)
- `carryOver` (`Record<string, unknown> \| null`, optional)
- `color` (`string`, optional)
- `everyoneIncludingNew` (`boolean`, optional)
- `id` (`string`, optional)
- `name` (`string`, optional)
- `negativeBalance` (`Record<string, unknown> \| null`, optional)
- `timeUnit` (`"DAYS" \| "HOURS"`, optional)
- `userAllowanceType` (`string \| null`, optional)
- `userGroups` (`Record<string, unknown>`, optional)
- `users` (`Record<string, unknown>`, optional)
- `workspaceId` (`string`, optional)

### `delete`

**Request fields** (`DeletePoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)

### `archive`

**Request fields** (`ArchivePoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `archived` (`boolean`, optional)
- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`ArchivePoliciesRequestBody`, required)
- `archived` (`boolean`, optional)

