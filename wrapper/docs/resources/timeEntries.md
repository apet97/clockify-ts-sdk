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

### `patchWorkspacesWorkspaceIdTimeEntriesInvoiced`

**Example:**

```typescript
    await client.timeEntries.patchWorkspacesWorkspaceIdTimeEntriesInvoiced({
        workspaceId: "workspaceId",
        invoiced: true,
        timeEntryIds: ["timeEntryIds"]
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdTimeEntriesInvoicedRequest`):

- `workspaceId` (`string`, required)
- `invoiced` (`boolean`, required)
- `timeEntryIds` (`string[]`, required)

### `patchWorkspacesWorkspaceIdTimeEntriesInvoicedBulk`

**Example:**

```typescript
    await client.timeEntries.patchWorkspacesWorkspaceIdTimeEntriesInvoicedBulk({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdTimeEntriesInvoicedBulkRequest`):

- `workspaceId` (`string`, required)
- `ids` (`string[]`, optional)
- `invoiced` (`boolean`, optional)

### `getWorkspacesWorkspaceIdTimeEntriesStatusInProgress`

**Example:**

```typescript
    await client.timeEntries.getWorkspacesWorkspaceIdTimeEntriesStatusInProgress({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdTimeEntriesStatusInProgressRequest`):

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

### `getWorkspacesWorkspaceIdUserUserIdTimeEntries`

**Example:**

```typescript
    await client.timeEntries.getWorkspacesWorkspaceIdUserUserIdTimeEntries({
        workspaceId: "workspaceId",
        userId: "userId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdUserUserIdTimeEntriesRequest`):

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

### `postWorkspacesWorkspaceIdUserUserIdTimeEntries`

**Example:**

```typescript
    await client.timeEntries.postWorkspacesWorkspaceIdUserUserIdTimeEntries({
        workspaceId: "workspaceId",
        userId: "userId",
        body: {
            start: "2024-01-15T09:30:00Z"
        }
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdUserUserIdTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `body` (`ClockifyApi.TimeEntryCreate`, required)

### `putWorkspacesWorkspaceIdUserUserIdTimeEntries`

**Example:**

```typescript
    await client.timeEntries.putWorkspacesWorkspaceIdUserUserIdTimeEntries({
        workspaceId: "workspaceId",
        userId: "userId",
        body: [{
                end: "2024-01-15T09:30:00Z",
                id: "id",
                start: "2024-01-15T09:30:00Z"
            }]
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdUserUserIdTimeEntriesRequest`):

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

### `patchWorkspacesWorkspaceIdUserUserIdTimeEntries`

**Example:**

```typescript
    await client.timeEntries.patchWorkspacesWorkspaceIdUserUserIdTimeEntries({
        workspaceId: "workspaceId",
        userId: "userId",
        end: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdUserUserIdTimeEntriesRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `end` (`string`, required)

### `patchWorkspacesWorkspaceIdUserUserIdTimeEntriesStop`

**Example:**

```typescript
    await client.timeEntries.patchWorkspacesWorkspaceIdUserUserIdTimeEntriesStop({
        workspaceId: "workspaceId",
        userId: "userId",
        end: "2024-01-15T09:30:00Z"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdUserUserIdTimeEntriesStopRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `end` (`string`, required)

### `postWorkspacesWorkspaceIdUserUserIdTimeEntriesTimeEntryIdDuplicate`

**Example:**

```typescript
    await client.timeEntries.postWorkspacesWorkspaceIdUserUserIdTimeEntriesTimeEntryIdDuplicate({
        workspaceId: "workspaceId",
        userId: "userId",
        timeEntryId: "timeEntryId"
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdUserUserIdTimeEntriesTimeEntryIdDuplicateRequest`):

- `workspaceId` (`string`, required)
- `userId` (`string`, required)
- `timeEntryId` (`string`, required)

