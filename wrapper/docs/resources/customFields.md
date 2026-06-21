# customFields

7 methods on `client.customFields`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `listForWorkspace`

**Request fields** (`ListForWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `name` (`string`, optional) — Filters custom fields by a string contained in the custom field name.
- `status` (`ClockifyApi.CustomFieldStatus`, optional) — Filters custom fields by custom field status.
- `entity-type` (`ClockifyApi.CustomFieldEntityType[]`, optional) — Filters custom fields by custom field entity type. Use repeated query parameters for more than one value, for example entity-type=TIMEENTRY&entity-type=USER.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `createForWorkspace`

**Request fields** (`CreateForWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `allowedValues` (`string[]`, optional) — Represents a list of custom field allowed values.
- `description` (`string`, optional) — Represents custom field description.
- `entityType` (`ClockifyApi.CustomFieldEntityType`, optional)
- `name` (`string`, required) — Represents custom field name.
- `onlyAdminCanEdit` (`boolean`, optional) — Flag to set whether custom field is modifiable only by admin users.
- `placeholder` (`string`, optional) — Represents custom field placeholder value.
- `status` (`ClockifyApi.CustomFieldStatus`, optional)
- `type` (`ClockifyApi.CustomFieldType`, required)
- `workspaceDefaultValue` (`ClockifyApi.CustomFieldValue`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `body` (`CreateForWorkspaceCustomFieldsRequestBody`, required)
- `allowedValues` (`string[]`, optional) — Represents a list of custom field allowed values.
- `description` (`string`, optional) — Represents custom field description.
- `entityType` (`ClockifyApi.CustomFieldEntityType`, optional)
- `name` (`string`, required) — Represents custom field name.
- `onlyAdminCanEdit` (`boolean`, optional) — Flag to set whether custom field is modifiable only by admin users.
- `placeholder` (`string`, optional) — Represents custom field placeholder value.
- `status` (`ClockifyApi.CustomFieldStatus`, optional)
- `type` (`ClockifyApi.CustomFieldType`, required)
- `workspaceDefaultValue` (`ClockifyApi.CustomFieldValue`, optional)

### `updateForWorkspace`

**Request fields** (`UpdateForWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `customFieldId` (`string`, required)
- `allowedValues` (`string[]`, optional) — Represents a list of custom field allowed values.
- `description` (`string`, optional) — Represents a custom field description.
- `name` (`string`, required) — Represents a custom field name.
- `onlyAdminCanEdit` (`boolean`, optional) — Flag to set whether custom field is modifiable only by admin users.
- `placeholder` (`string`, optional) — Represents a custom field placeholder value.
- `required` (`boolean`, optional) — Flag to set whether custom field is mandatory or not.
- `status` (`ClockifyApi.CustomFieldStatus`, optional)
- `type` (`ClockifyApi.CustomFieldType`, required)
- `workspaceDefaultValue` (`ClockifyApi.CustomFieldValue`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `customFieldId` (`string`, required)
- `body` (`UpdateForWorkspaceCustomFieldsRequestBody`, required)
- `allowedValues` (`string[]`, optional) — Represents a list of custom field allowed values.
- `description` (`string`, optional) — Represents a custom field description.
- `name` (`string`, required) — Represents a custom field name.
- `onlyAdminCanEdit` (`boolean`, optional) — Flag to set whether custom field is modifiable only by admin users.
- `placeholder` (`string`, optional) — Represents a custom field placeholder value.
- `required` (`boolean`, optional) — Flag to set whether custom field is mandatory or not.
- `status` (`ClockifyApi.CustomFieldStatus`, optional)
- `type` (`ClockifyApi.CustomFieldType`, required)
- `workspaceDefaultValue` (`ClockifyApi.CustomFieldValue`, optional)

### `deleteForWorkspace`

**Request fields** (`DeleteForWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `customFieldId` (`string`, required)

### `listForProject`

**Request fields** (`ListForProjectCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `status` (`ClockifyApi.CustomFieldStatus`, optional) — Filters custom fields by custom field status.
- `entity-type` (`ClockifyApi.CustomFieldEntityType[]`, optional) — Filters custom fields by custom field entity type. Use repeated query parameters for more than one value, for example entity-type=TIMEENTRY&entity-type=USER.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `updateForProject`

**Request fields** (`UpdateForProjectCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `customFieldId` (`string`, required)
- `defaultValue` (`ClockifyApi.CustomFieldValue`, optional)
- `status` (`ClockifyApi.CustomFieldStatus`, optional)
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `customFieldId` (`string`, required)
- `body` (`UpdateForProjectCustomFieldsRequestBody`, required)
- `defaultValue` (`ClockifyApi.CustomFieldValue`, optional)
- `status` (`ClockifyApi.CustomFieldStatus`, optional)

### `removeFromProject`

**Request fields** (`RemoveFromProjectCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `customFieldId` (`string`, required)

