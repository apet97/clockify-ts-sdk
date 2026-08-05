# timeEntries

13 methods on `client.timeEntries`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `create`

**Request fields** (`CreateTimeEntryRequest`):

- `workspaceId` (`string`, required)
- `billable` (`boolean`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional)
- `projectId` (`string`, optional)
- `start` (`string`, required)
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`"REGULAR" \| "BREAK"`, optional)
- `workspaceId` (`string`, required)
- `body` (`CreateTimeEntryRequestBody`, required)
- `billable` (`boolean`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional)
- `projectId` (`string`, optional)
- `start` (`string`, required)
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`"REGULAR" \| "BREAK"`, optional)

### `get`

**Request fields** (`GetTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)
- `hydrated` (`boolean`, optional)
- `consider-duration-format` (`boolean`, optional)

### `update`

**Request fields** (`UpdateTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)
- `billable` (`boolean`, optional)
- `customFields` (`Record<string, unknown>[]`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional) — Omit to start a running timer
- `projectId` (`string`, optional)
- `start` (`string`, required) — Required ISO 8601
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`"REGULAR" \| "BREAK"`, optional)
- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)
- `body` (`UpdateTimeEntriesRequestBody`, required)
- `billable` (`boolean`, optional)
- `customFields` (`Record<string, unknown>[]`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional) — Omit to start a running timer
- `projectId` (`string`, optional)
- `start` (`string`, required) — Required ISO 8601
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`"REGULAR" \| "BREAK"`, optional)

### `delete`

**Request fields** (`DeleteTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)

### `getMultipleTimeEntries`

**Request fields** (`GetMultipleTimeEntriesTimeEntriesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `hydrated` (`boolean`, optional) — Flag to set whether to include additional information of time entries or not.
- `timeEntryIds` (`string[]`, required) — Represents time entry identifiers across the system.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`GetMultipleTimeEntriesTimeEntriesRequestBody`, required)
- `hydrated` (`boolean`, optional) — Flag to set whether to include additional information of time entries or not.
- `timeEntryIds` (`string[]`, required) — Represents time entry identifiers across the system.

### `markInvoiced`

**Request fields** (`MarkInvoicedTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `invoiced` (`boolean`, required)
- `timeEntryIds` (`string[]`, required)
- `workspaceId` (`string`, required)
- `body` (`MarkInvoicedTimeEntriesRequestBody`, required)
- `invoiced` (`boolean`, required)
- `timeEntryIds` (`string[]`, required)

### `listInProgress`

**Request fields** (`ListInProgressTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `listForUser`

**Request fields** (`ListForUserTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `description` (`string`, optional)
- `start` (`string`, optional)
- `end` (`string`, optional)
- `project` (`string`, optional)
- `task` (`string`, optional)
- `tags` (`string[]`, optional)
- `project-required` (`boolean`, optional)
- `task-required` (`boolean`, optional)
- `hydrated` (`boolean`, optional)
- `in-progress` (`boolean`, optional)
- `get-week-before` (`string`, optional)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `createForUser`

**Request fields** (`CreateForUserTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `billable` (`boolean`, optional)
- `customFields` (`Record<string, unknown>[]`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional) — Omit to start a running timer
- `projectId` (`string`, optional)
- `start` (`string`, required) — Required ISO 8601
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`"REGULAR" \| "BREAK"`, optional)
- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`CreateForUserTimeEntriesRequestBody`, required)
- `billable` (`boolean`, optional)
- `customFields` (`Record<string, unknown>[]`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional) — Omit to start a running timer
- `projectId` (`string`, optional)
- `start` (`string`, required) — Required ISO 8601
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`"REGULAR" \| "BREAK"`, optional)

### `startTimer`

**Request fields** (`StartTimerTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`ClockifyApi.BulkEditTimeEntryRequest[]`, required)

### `updateForUser`

**Request fields** (`UpdateForUserTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `end` (`string`, required)
- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`UpdateForUserTimeEntriesRequestBody`, required)
- `end` (`string`, required)

### `deleteMany`

**Request fields** (`DeleteManyTimeEntriesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `time-entry-ids` (`string[]`, required) — Represents a list of time entry ids to delete.

### `duplicate`

**Request fields** (`DuplicateTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `timeEntryId` (`string`, required)

