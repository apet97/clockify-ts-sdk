# webhooks

10 methods on `client.webhooks`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `listForAddon`

**Example:**

```typescript
    await client.webhooks.listForAddon({
        workspaceId: "workspaceId",
        addonId: "addonId"
    })
```

**Request fields** (`ListForAddonWebhooksRequest`):

- `workspaceId` (`string`, required)
- `addonId` (`string`, required)

### `list`

**Example:**

```typescript
    await client.webhooks.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListWebhooksRequest`):

- `workspaceId` (`string`, required)
- `type` (`ClockifyApi.WebhookType`, optional) — Represents a webhook type.

### `create`

**Example:**

```typescript
    await client.webhooks.create({
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

**Request fields** (`CreateWebhooksRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.WebhookRequest`, required)

### `get`

**Example:**

```typescript
    await client.webhooks.get({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`GetWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.webhooks.update({
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

**Request fields** (`UpdateWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `body` (`ClockifyApi.WebhookRequest`, required)

### `delete`

**Example:**

```typescript
    await client.webhooks.delete({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`DeleteWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `rotateToken`

**Example:**

```typescript
    await client.webhooks.rotateToken({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`RotateTokenWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `listLogs`

**Example:**

```typescript
    await client.webhooks.listLogs({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`ListLogsWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `searchLogs`

**Example:**

```typescript
    await client.webhooks.searchLogs({
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

### `updateToken`

**Example:**

```typescript
    await client.webhooks.updateToken({
        workspaceId: "workspaceId",
        webhookId: "webhookId"
    })
```

**Request fields** (`UpdateTokenWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

