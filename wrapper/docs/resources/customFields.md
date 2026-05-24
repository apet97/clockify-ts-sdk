# customFields

7 methods on `client.customFields`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `listForWorkspace`

**Example:**

```typescript
    await client.customFields.listForWorkspace({
        workspaceId: "64a687e29ae1f428e7ebe303"
    })
```

**Request fields** (`ListForWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `createForWorkspace`

**Example:**

```typescript
    await client.customFields.createForWorkspace({
        workspaceId: "64a687e29ae1f428e7ebe303",
        allowedValues: ["New York", "London", "Manila", "Sydney", "Belgrade"],
        description: "This field contains a location.",
        entityType: "USER",
        name: "location",
        onlyAdminCanEdit: false,
        placeholder: "Location",
        status: "VISIBLE",
        type: "DROPDOWN_MULTIPLE",
        workspaceDefaultValue: ["Manila"]
    })
```

**Request fields** (`CreateCustomFieldRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `allowedValues` (`string[]`, optional) — Represents a list of custom field allowed values.
- `description` (`string`, optional) — Represents custom field description.
- `entityType` (`ClockifyApi.CustomFieldEntityType`, optional)
- `name` (`string`, required) — Represents custom field name.
- `onlyAdminCanEdit` (`boolean`, optional) — Flag to set whether custom field is modifiable only by admin users.
- `placeholder` (`string`, optional) — Represents custom field placeholder value.
- `status` (`ClockifyApi.CustomFieldStatus`, optional)
- `type` (`ClockifyApi.CustomFieldType`, required)
- `workspaceDefaultValue` (`ClockifyApi.CustomFieldValue \| null`, optional)

### `updateForWorkspace`

**Example:**

```typescript
    await client.customFields.updateForWorkspace({
        workspaceId: "64a687e29ae1f428e7ebe303",
        customFieldId: "customFieldId",
        allowedValues: ["New York", "London", "Manila", "Sydney", "Belgrade"],
        description: "This field contains a location.",
        name: "location",
        onlyAdminCanEdit: false,
        placeholder: "Location",
        required: false,
        status: "VISIBLE",
        type: "DROPDOWN_MULTIPLE",
        workspaceDefaultValue: ["Manila"]
    })
```

**Request fields** (`UpdateCustomFieldRequest`):

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
- `workspaceDefaultValue` (`ClockifyApi.CustomFieldValue \| null`, optional)

### `deleteForWorkspace`

**Example:**

```typescript
    await client.customFields.deleteForWorkspace({
        workspaceId: "64a687e29ae1f428e7ebe303",
        customFieldId: "customFieldId"
    })
```

**Request fields** (`DeleteForWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `customFieldId` (`string`, required)

### `listForProject`

**Example:**

```typescript
    await client.customFields.listForProject({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "projectId"
    })
```

**Request fields** (`ListForProjectCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `removeFromProject`

**Example:**

```typescript
    await client.customFields.removeFromProject({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "projectId",
        customFieldId: "customFieldId"
    })
```

**Request fields** (`RemoveFromProjectCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `customFieldId` (`string`, required)

### `updateForProject`

**Example:**

```typescript
    await client.customFields.updateForProject({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "projectId",
        customFieldId: "customFieldId",
        defaultValue: "Manila",
        status: "VISIBLE"
    })
```

**Request fields** (`UpdateProjectCustomFieldRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `customFieldId` (`string`, required)
- `defaultValue` (`ClockifyApi.CustomFieldValue \| null`, optional)
- `status` (`ClockifyApi.CustomFieldStatus`, optional)

