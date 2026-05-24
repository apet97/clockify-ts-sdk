# sharedReports

5 methods on `client.sharedReports`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getSharedReportsSharedReportId`

**Request fields** (`GetSharedReportsSharedReportIdRequest`):

- `sharedReportId` (`string`, required)
- `exportType` (`ClockifyApi.GetSharedReportsSharedReportIdRequestExportType`, optional)

### `list`

**Example:**

```typescript
    await client.sharedReports.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListSharedReportsRequest`):

- `workspaceId` (`string`, required)

### `create`

**Example:**

```typescript
    await client.sharedReports.create({
        workspaceId: "workspaceId",
        body: {
            filter: {
                dateRangeEnd: "2024-01-15T09:30:00Z",
                dateRangeStart: "2024-01-15T09:30:00Z",
                exportType: "JSON_V1"
            },
            name: "name",
            type: "SUMMARY"
        }
    })
```

**Request fields** (`CreateSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.SharedReportCreate`, required)

### `update`

**Example:**

```typescript
    await client.sharedReports.update({
        workspaceId: "workspaceId",
        sharedReportId: "sharedReportId",
        body: {
            filter: {
                dateRangeEnd: "2024-01-15T09:30:00Z",
                dateRangeStart: "2024-01-15T09:30:00Z",
                exportType: "JSON_V1"
            },
            name: "name",
            type: "SUMMARY"
        }
    })
```

**Request fields** (`UpdateSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)
- `body` (`ClockifyApi.SharedReportCreate`, required)

### `delete`

**Example:**

```typescript
    await client.sharedReports.delete({
        workspaceId: "workspaceId",
        sharedReportId: "sharedReportId"
    })
```

**Request fields** (`DeleteSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)

