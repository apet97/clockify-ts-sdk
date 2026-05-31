# workspaces

10 methods on `client.workspaces`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

### `create`

**Request fields** (`CreateWorkspaceRequest`):

- `name` (`string`, required) — Represents a workspace name.
- `organizationId` (`string`, required) — Represents the Cake organization identifier across the system.
- `body` (`CreateWorkspaceRequestBody`, required)
- `name` (`string`, required) — Represents a workspace name.
- `organizationId` (`string`, required) — Represents the Cake organization identifier across the system.

### `get`

**Request fields** (`GetWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.

### `update`

**Request fields** (`UpdateWorkspacesRequest`):

- `workspaceId` (`string`, required)

### `updateCostRate`

**Request fields** (`UpdateCostRateWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`UpdateCostRateWorkspacesRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `updateBillableRate`

**Request fields** (`UpdateBillableRateWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `amount` (`number`, required) — Represents an amount as integer.
- `currency` (`string`, required) — Represents a currency.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`UpdateBillableRateWorkspacesRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `currency` (`string`, required) — Represents a currency.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `addUser`

**Request fields** (`AddUserWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `send-email` (`"true" \| "false"`, required) — Indicates whether to send an email when user is added to the workspace.
- `email` (`string`, required) — Represents an email address of the user.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `send-email` (`"true" \| "false"`, required) — Indicates whether to send an email when user is added to the workspace.
- `body` (`AddUserWorkspacesRequestBody`, required)
- `email` (`string`, required) — Represents an email address of the user.

### `updateUserStatus`

**Request fields** (`UpdateUserStatusWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `status` (`"ACTIVE" \| "INACTIVE"`, required) — Represents membership status.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`UpdateUserStatusWorkspacesRequestBody`, required)
- `status` (`"ACTIVE" \| "INACTIVE"`, required) — Represents membership status.

### `updateUserCostRate`

**Request fields** (`UpdateUserCostRateWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`UpdateUserCostRateWorkspacesRequestBody`, required)
- `amount` (`number`, required) — Represents an amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

### `updateUserHourlyRate`

**Request fields** (`UpdateUserHourlyRateWorkspacesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `amount` (`number`, required) — Represents an hourly rate amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`UpdateUserHourlyRateWorkspacesRequestBody`, required)
- `amount` (`number`, required) — Represents an hourly rate amount as integer.
- `since` (`string`, optional) — Represents a date and time in yyyy-MM-ddThh:mm:ssZ format.

