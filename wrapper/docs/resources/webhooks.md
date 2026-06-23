# webhooks

11 methods on `client.webhooks`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `listForAddon`

**Request fields** (`ListForAddonWebhooksRequest`):

- `workspaceId` (`string`, required)
- `addonId` (`string`, required)

### `list`

**Request fields** (`ListWebhooksRequest`):

- `workspaceId` (`string`, required)
- `type` (`ClockifyApi.WebhookType`, optional) — Represents a webhook type.

### `create`

**Request fields** (`WebhookRequest`):

- `workspaceId` (`string`, required)
- `name` (`string`, required) — Represents a webhook name.
- `triggerSource` (`string[]`, required)
- `triggerSourceType` (`ClockifyApi.WebhookEventTriggerSourceType`, required) — USER_EMAIL_CHANGED and USER_UPDATED require USER_ID.
- `url` (`string`, required) — Represents a webhook target url.
- `webhookEvent` (`ClockifyApi.WebhookEventType`, required)
- `workspaceId` (`string`, required)
- `body` (`WebhookRequestBody`, required)
- `name` (`string`, required) — Represents a webhook name.
- `triggerSource` (`string[]`, required)
- `triggerSourceType` (`ClockifyApi.WebhookEventTriggerSourceType`, required) — USER_EMAIL_CHANGED and USER_UPDATED require USER_ID.
- `url` (`string`, required) — Represents a webhook target url.
- `webhookEvent` (`ClockifyApi.WebhookEventType`, required)

### `get`

**Request fields** (`GetWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `update`

**Request fields** (`UpdateWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `name` (`string`, required) — Represents a webhook name.
- `triggerSource` (`string[]`, required)
- `triggerSourceType` (`ClockifyApi.WebhookEventTriggerSourceType`, required) — USER_EMAIL_CHANGED and USER_UPDATED require USER_ID.
- `url` (`string`, required) — Represents a webhook target url.
- `webhookEvent` (`ClockifyApi.WebhookEventType`, required)
- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `body` (`UpdateWebhooksRequestBody`, required)
- `name` (`string`, required) — Represents a webhook name.
- `triggerSource` (`string[]`, required)
- `triggerSourceType` (`ClockifyApi.WebhookEventTriggerSourceType`, required) — USER_EMAIL_CHANGED and USER_UPDATED require USER_ID.
- `url` (`string`, required) — Represents a webhook target url.
- `webhookEvent` (`ClockifyApi.WebhookEventType`, required)

### `delete`

**Request fields** (`DeleteWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `rotateToken`

**Request fields** (`RotateTokenWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `listLogs`

**Request fields** (`ListLogsWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

### `searchLogs`

**Request fields** (`SearchLogsWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `size` (`number`, optional) — Page size.
- `from` (`string`, optional) — Represents date and time in yyyy-MM-ddThh:mm:ssZ format. If provided, results will include logs which occurred after this value.
- `sortByNewest` (`boolean`, optional) — If set to true, logs will be sorted with most recent first.
- `status` (`"ALL" \| "SUCCEEDED" \| "FAILED"`, optional) — Filters logs by status.
- `to` (`string`, optional) — Represents date and time in yyyy-MM-ddThh:mm:ssZ format. If provided, results will include logs which occurred before this value.
- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)
- `page` (`number`, optional) — Page number.
- `size` (`number`, optional) — Page size.
- `body` (`SearchLogsWebhooksRequestBody`, required)
- `from` (`string`, optional) — Represents date and time in yyyy-MM-ddThh:mm:ssZ format. If provided, results will include logs which occurred after this value.
- `sortByNewest` (`boolean`, optional) — If set to true, logs will be sorted with most recent first.
- `status` (`"ALL" \| "SUCCEEDED" \| "FAILED"`, optional) — Filters logs by status.
- `to` (`string`, optional) — Represents date and time in yyyy-MM-ddThh:mm:ssZ format. If provided, results will include logs which occurred before this value.

### `getWebhookEventStatusesWithLatestLog`

**Request fields** (`GetWebhookEventStatusesWithLatestLogWebhooksRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `webhookId` (`string`, required) — Represents a webhook identifier across the system.
- `page` (`number`, optional) — Page number.
- `size` (`number`, optional) — Page size.
- `statuses` (`"SUCCEEDED" \| "RETRYING" \| "FAILED"`, optional) — Represents a filter for webhook event status.

### `updateToken`

**Request fields** (`UpdateTokenWebhooksRequest`):

- `workspaceId` (`string`, required)
- `webhookId` (`string`, required)

