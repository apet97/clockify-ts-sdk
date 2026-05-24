# webhooks

10 methods on `client.webhooks`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getAddonWebhooksOnWorkspace`

**Example:**

```typescript
    await client.webhooks.getAddonWebhooksOnWorkspace({
        workspaceId: "workspaceId",
        addonId: "addonId"
    })
```

**Request fields** (`GetAddonWebhooksOnWorkspaceRequest`):

- `workspaceId` (`string`, required)
- `addonId` (`string`, required)

### `getWebhooksOnWorkspace`

**Example:**

```typescript
    await client.webhooks.getWebhooksOnWorkspace({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWebhooksOnWorkspaceRequest`):

- `workspaceId` (`string`, required)
- `type` (`ClockifyApi.WebhookType`, optional) — Represents a webhook type.

### `createWebhook`

**Example:**

```typescript
    await client.webhooks.createWebhook({
        workspaceId: "workspaceId",
        body: {
            name: "Stripe",
            triggerSource: ["54a687e29ae1f428e7ebe909", "87p187e29ae1f428e7ebej56"],
            triggerSourceType: "PROJECT_ID",
            url: "https://example-clockify.com/stripeEndpoint",
            webhookEvent: "NEW_PROJECT"
        }
    })
```

**Request fields** (`CreateWebhookRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.WebhookRequest`, required)

### `getWebhookById`

**Example:**

```typescript
    await client.webhooks.getWebhookById({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`GetWebhookByIdRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `updateWebhook`

**Example:**

```typescript
    await client.webhooks.updateWebhook({
        workspaceId: "workspaceId",
        webhookId: "webhookId",
        body: {
            name: "Stripe",
            triggerSource: ["54a687e29ae1f428e7ebe909", "87p187e29ae1f428e7ebej56"],
            triggerSourceType: "PROJECT_ID",
            url: "https://example-clockify.com/stripeEndpoint",
            webhookEvent: "NEW_PROJECT"
        }
    })
```

**Request fields** (`UpdateWebhookRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `body` (`ClockifyApi.WebhookRequest`, required)

### `deleteWebhook`

**Example:**

```typescript
    await client.webhooks.deleteWebhook({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`DeleteWebhookRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `patchWorkspacesWorkspaceIdWebhooksWebhookIdGenerateNewToken`

**Example:**

```typescript
    await client.webhooks.patchWorkspacesWorkspaceIdWebhooksWebhookIdGenerateNewToken({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdWebhooksWebhookIdGenerateNewTokenRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `getWorkspacesWorkspaceIdWebhooksWebhookIdLogs`

**Example:**

```typescript
    await client.webhooks.getWorkspacesWorkspaceIdWebhooksWebhookIdLogs({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdWebhooksWebhookIdLogsRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `getWebhookLogs`

**Example:**

```typescript
    await client.webhooks.getWebhookLogs({
        workspaceId: "workspaceId",
        webhookId: "webhookId",
        from: "2023-02-01T13:00:46Z",
        sortByNewest: false,
        status: "ALL",
        to: "2023-02-05T13:00:46Z"
    })
```

**Request fields** (`WebhookLogsRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `size` (`number`, optional) — Page size.
- `from` (`string`, optional) — Represents date and time in yyyy-MM-ddThh:mm:ssZ format. If provided, results will include logs which occurred after this value.
- `sortByNewest` (`boolean`, optional) — If set to true, logs will be sorted with most recent first.
- `status` (`WebhookLogsRequest.Status`, optional) — Filters logs by status.
- `to` (`string`, optional) — Represents date and time in yyyy-MM-ddThh:mm:ssZ format. If provided, results will include logs which occurred before this value.

### `patchWorkspacesWorkspaceIdWebhooksWebhookIdToken`

**Example:**

```typescript
    await client.webhooks.patchWorkspacesWorkspaceIdWebhooksWebhookIdToken({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdWebhooksWebhookIdTokenRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

