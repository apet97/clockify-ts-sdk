# memberProfiles

2 methods on `client.memberProfiles`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../../../docs/api/).

## Methods

### `get`

**Request fields** (`GetMemberProfilesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `update`

**Request fields** (`UpdateMemberProfilesRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `imageUrl` (`string`, optional) — Represents an image url. A field that can only be updated for limited users.
- `name` (`string`, optional) — Deprecated. Represents name of the user and can only be updated for limited users.
- `removeProfileImage` (`boolean`, optional) — Indicates whether to remove profile image or not.
- `userCustomFields` (`ClockifyApi.UpsertUserCustomFieldRequest[]`, optional) — Represents a list of upsert user custom field objects.
- `weekStart` (`ClockifyApi.UsersDayOfWeek`, optional)
- `workCapacity` (`string`, optional) — Represents work capacity as a time duration in ISO-8601 format. For example, PT7H.
- `workingDays` (`("MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY")[]`, optional) — Live Clockify serializes working days as an array of day enum strings; JSON-encoded strings are rejected.
- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `body` (`UpdateMemberProfilesRequestBody`, required)
- `imageUrl` (`string`, optional) — Represents an image url. A field that can only be updated for limited users.
- `name` (`string`, optional) — Deprecated. Represents name of the user and can only be updated for limited users.
- `removeProfileImage` (`boolean`, optional) — Indicates whether to remove profile image or not.
- `userCustomFields` (`ClockifyApi.UpsertUserCustomFieldRequest[]`, optional) — Represents a list of upsert user custom field objects.
- `weekStart` (`ClockifyApi.UsersDayOfWeek`, optional)
- `workCapacity` (`string`, optional) — Represents work capacity as a time duration in ISO-8601 format. For example, PT7H.
- `workingDays` (`("MONDAY" \| "TUESDAY" \| "WEDNESDAY" \| "THURSDAY" \| "FRIDAY" \| "SATURDAY" \| "SUNDAY")[]`, optional) — Live Clockify serializes working days as an array of day enum strings; JSON-encoded strings are rejected.

