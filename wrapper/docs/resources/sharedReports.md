# sharedReports

5 methods on `client.sharedReports`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getSharedReportsSharedReportId`

**Request fields** (`GetSharedReportsSharedReportIdRequest`):

- `sharedReportId` (`string`, required)
- `exportType` (`ClockifyApi.GetSharedReportsSharedReportIdRequestExportType`, optional)

### `getWorkspacesWorkspaceIdSharedReports`

**Example:**

```typescript
    await client.sharedReports.getWorkspacesWorkspaceIdSharedReports({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdSharedReportsRequest`):

- `workspaceId` (`string`, required)

### `postWorkspacesWorkspaceIdSharedReports`

**Example:**

```typescript
    await client.sharedReports.postWorkspacesWorkspaceIdSharedReports({
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

**Request fields** (`PostWorkspacesWorkspaceIdSharedReportsRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.SharedReportCreate`, required)

### `putWorkspacesWorkspaceIdSharedReportsSharedReportId`

**Example:**

```typescript
    await client.sharedReports.putWorkspacesWorkspaceIdSharedReportsSharedReportId({
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

**Request fields** (`PutWorkspacesWorkspaceIdSharedReportsSharedReportIdRequest`):

- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)
- `body` (`ClockifyApi.SharedReportCreate`, required)

### `deleteWorkspacesWorkspaceIdSharedReportsSharedReportId`

**Example:**

```typescript
    await client.sharedReports.deleteWorkspacesWorkspaceIdSharedReportsSharedReportId({
        workspaceId: "workspaceId",
        sharedReportId: "sharedReportId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdSharedReportsSharedReportIdRequest`):

- `workspaceId` (`string`, required)
- `sharedReportId` (`string`, required)

