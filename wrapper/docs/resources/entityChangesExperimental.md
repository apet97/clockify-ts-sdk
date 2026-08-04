# entityChangesExperimental

3 methods on `client.entityChangesExperimental`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `listCreated`

**Request fields** (`ListCreatedEntityChangesExperimentalRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `type` (`ClockifyApi.ChangeTrackerDocumentType[]`, required) — Entity-change document type. Accepted values: APPROVAL_REQUESTS, BALANCE, CLIENTS, CUSTOM_FIELDS, HOLIDAYS, INVOICES, PROJECTS, PTO_POLICY, SCHEDULED_ASSIGNMENT, TAGS, TASKS, TIME_ENTRY, TIME_ENTRY_CUSTOM_FIELD_VALUE, TIME_ENTRY_RATE, TIME_OFF_REQUEST, USER, USER_GROUPS.
- `start` (`string`, optional) — Represents the start date in yyyy-MM-ddThh:mm:ssZ format. This parameter is optional; if no start date is provided, the application will set a default start date that matches the end date to create a date range of 30 days. If the end date is not specified either, the default behavior will apply from the current date.
- `end` (`string`, optional) — Represents the end date in yyyy-MM-ddThh:mm:ssZ format. This parameter is optional; if no end date is provided, the application will set a default end date that matches the start date to create a date range of 30 days.
- `page` (`string`, optional)
- `limit` (`string`, optional)

### `listDeleted`

**Request fields** (`ListDeletedEntityChangesExperimentalRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system (Experimental)
- `type` (`ClockifyApi.ChangeTrackerDocumentType[]`, required) — Entity-change document type. Accepted values: APPROVAL_REQUESTS, BALANCE, CLIENTS, CUSTOM_FIELDS, HOLIDAYS, INVOICES, PROJECTS, PTO_POLICY, SCHEDULED_ASSIGNMENT, TAGS, TASKS, TIME_ENTRY, TIME_ENTRY_CUSTOM_FIELD_VALUE, TIME_ENTRY_RATE, TIME_OFF_REQUEST, USER, USER_GROUPS.
- `start` (`string`, optional) — Represents the start date in yyyy-MM-ddThh:mm:ssZ format. This parameter is optional; if no start date is provided, the application will set a default start date that matches the end date to create a date range of 30 days. If the end date is not specified either, the default behavior will apply from the current date.
- `end` (`string`, optional) — Represents the end date in yyyy-MM-ddThh:mm:ssZ format. This parameter is optional; if no end date is provided, the application will set a default end date that matches the start date to create a date range of 30 days.
- `page` (`string`, optional)
- `limit` (`string`, optional)

### `listUpdated`

**Request fields** (`ListUpdatedEntityChangesExperimentalRequest`):

- `workspaceId` (`string`, required) — Represents workspace identifier across the system.
- `type` (`ClockifyApi.ChangeTrackerDocumentType[]`, required) — Entity-change document type. Accepted values: APPROVAL_REQUESTS, BALANCE, CLIENTS, CUSTOM_FIELDS, HOLIDAYS, INVOICES, PROJECTS, PTO_POLICY, SCHEDULED_ASSIGNMENT, TAGS, TASKS, TIME_ENTRY, TIME_ENTRY_CUSTOM_FIELD_VALUE, TIME_ENTRY_RATE, TIME_OFF_REQUEST, USER, USER_GROUPS.
- `start` (`string`, optional) — Represents the start date in yyyy-MM-ddThh:mm:ssZ format. This parameter is optional; if no start date is provided, the application will set a default start date that matches the end date to create a date range of 30 days. If the end date is not specified either, the default behavior will apply from the current date.
- `end` (`string`, optional) — Represents the end date in yyyy-MM-ddThh:mm:ssZ format. This parameter is optional; if no end date is provided, the application will set a default end date that matches the start date to create a date range of 30 days.
- `page` (`string`, optional)
- `limit` (`string`, optional)

