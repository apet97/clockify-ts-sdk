# templateDeprecated

4 methods on `client.templateDeprecated`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `getTemplates`

**Request fields** (`GetTemplatesTemplateDeprecatedRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional)
- `cleansed` (`boolean`, optional)
- `hydrated` (`boolean`, optional)
- `page` (`number`, optional)
- `page-size` (`number`, optional)

### `createMany`

**Request fields** (`CreateManyTemplateDeprecatedRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`ClockifyApi.TemplateRequest[]`, required)

### `getTemplate`

**Request fields** (`GetTemplateTemplateDeprecatedRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `templateId` (`string`, required)
- `cleansed` (`boolean`, optional)
- `hydrated` (`boolean`, optional)

### `update`

**Request fields** (`UpdateTemplateDeprecatedRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `templateId` (`string`, required)
- `name` (`string`, required) — Represents a template name.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `templateId` (`string`, required)
- `body` (`UpdateTemplateDeprecatedRequestBody`, required)
- `name` (`string`, required) — Represents a template name.
