# customFields

7 methods on `client.customFields`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `listWorkspaceCustomFields`

**Example:**

```typescript
    await client.customFields.listWorkspaceCustomFields({
        workspaceId: "64a687e29ae1f428e7ebe303"
    })
```

**Request fields** (`ListWorkspaceCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `createWorkspaceCustomField`

**Example:**

```typescript
    await client.customFields.createWorkspaceCustomField({
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

### `updateWorkspaceCustomField`

**Example:**

```typescript
    await client.customFields.updateWorkspaceCustomField({
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

### `deleteWorkspaceCustomField`

**Example:**

```typescript
    await client.customFields.deleteWorkspaceCustomField({
        workspaceId: "64a687e29ae1f428e7ebe303",
        customFieldId: "customFieldId"
    })
```

**Request fields** (`DeleteWorkspaceCustomFieldRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `customFieldId` (`string`, required)

### `listProjectCustomFields`

**Example:**

```typescript
    await client.customFields.listProjectCustomFields({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "projectId"
    })
```

**Request fields** (`ListProjectCustomFieldsRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `removeProjectCustomField`

**Example:**

```typescript
    await client.customFields.removeProjectCustomField({
        workspaceId: "64a687e29ae1f428e7ebe303",
        projectId: "projectId",
        customFieldId: "customFieldId"
    })
```

**Request fields** (`RemoveProjectCustomFieldRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `projectId` (`string`, required)
- `customFieldId` (`string`, required)

### `updateProjectCustomField`

**Example:**

```typescript
    await client.customFields.updateProjectCustomField({
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

