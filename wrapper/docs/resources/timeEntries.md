# timeEntries

14 methods on `client.timeEntries`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `create`

**Example:**

```typescript
    await client.timeEntries.create({
        workspaceId: "workspaceId",
        start: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`CreateTimeEntryRequest`):

- `workspaceId` (`string`, required)
- `billable` (`boolean`, optional)
- `description` (`string`, optional)
- `end` (`string`, optional)
- `projectId` (`string`, optional)
- `start` (`string`, required)
- `tagIds` (`string[]`, optional)
- `taskId` (`string`, optional)
- `type` (`CreateTimeEntryRequest.Type`, optional)

### `markInvoiced`

**Example:**

```typescript
    await client.timeEntries.markInvoiced({
        workspaceId: "workspaceId",
        invoiced: true,
        timeEntryIds: ["timeEntryIds"]
    })
```

**Request fields** (`MarkInvoicedTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `invoiced` (`boolean`, required)
- `timeEntryIds` (`string[]`, required)

### `markInvoicedBulk`

**Example:**

```typescript
    await client.timeEntries.markInvoicedBulk({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`MarkInvoicedBulkTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `ids` (`string[]`, optional)
- `invoiced` (`boolean`, optional)

### `listInProgress`

**Example:**

```typescript
    await client.timeEntries.listInProgress({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListInProgressTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `get`

**Example:**

```typescript
    await client.timeEntries.get({
        workspaceId: "workspaceId",
        timeEntryId: "timeEntryId"
    })
```

**Request fields** (`GetTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)
- `hydrated` (`boolean`, optional)
- `consider-duration-format` (`boolean`, optional)

### `update`

**Example:**

```typescript
    await client.timeEntries.update({
        workspaceId: "workspaceId",
        timeEntryId: "timeEntryId",
        body: {
            start: "2024-01-15T09:30:00Z"
        }
    })
```

**Request fields** (`UpdateTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)
- `body` (`ClockifyApi.TimeEntryUpdate`, required)

### `delete`

**Example:**

```typescript
    await client.timeEntries.delete({
        workspaceId: "workspaceId",
        timeEntryId: "timeEntryId"
    })
```

**Request fields** (`DeleteTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `timeEntryId` (`string`, required)

### `listForUser`

**Example:**

```typescript
    await client.timeEntries.listForUser({
        workspaceId: "workspaceId",
        userId: "userId"
    })
```

**Request fields** (`ListForUserTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `description` (`string`, optional)
- `start` (`string`, optional)
- `end` (`string`, optional)
- `project` (`string`, optional)
- `task` (`string`, optional)
- `tags` (`string \| string[]`, optional)
- `project-required` (`boolean`, optional)
- `task-required` (`boolean`, optional)
- `hydrated` (`boolean`, optional)
- `in-progress` (`boolean`, optional)
- `get-week-before` (`string`, optional)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `createForUser`

**Example:**

```typescript
    await client.timeEntries.createForUser({
        workspaceId: "workspaceId",
        userId: "userId",
        body: {
            start: "2024-01-15T09:30:00Z"
        }
    })
```

**Request fields** (`CreateForUserTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`ClockifyApi.TimeEntryCreate`, required)

### `startTimer`

**Example:**

```typescript
    await client.timeEntries.startTimer({
        workspaceId: "workspaceId",
        userId: "userId",
        body: [{
                end: "2024-01-15T09:30:00Z",
                id: "id",
                start: "2024-01-15T09:30:00Z"
            }]
    })
```

**Request fields** (`StartTimerTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`ClockifyApi.BulkEditTimeEntryRequest[]`, required)

### `deleteMany`

**Example:**

```typescript
    await client.timeEntries.deleteMany({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        "time-entry-ids": ["5a0ab5acb07987125438b60f"]
    })
```

**Request fields** (`DeleteManyRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `time-entry-ids` (`string \| string[]`, optional) — Represents a list of time entry ids to delete.

### `updateForUser`

**Example:**

```typescript
    await client.timeEntries.updateForUser({
        workspaceId: "workspaceId",
        userId: "userId",
        end: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`UpdateForUserTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `end` (`string`, required)

### `stopTimer`

**Example:**

```typescript
    await client.timeEntries.stopTimer({
        workspaceId: "workspaceId",
        userId: "userId",
        end: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`StopTimerTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `end` (`string`, required)

### `duplicate`

**Example:**

```typescript
    await client.timeEntries.duplicate({
        workspaceId: "workspaceId",
        userId: "userId",
        timeEntryId: "timeEntryId"
    })
```

**Request fields** (`DuplicateTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `timeEntryId` (`string`, required)

