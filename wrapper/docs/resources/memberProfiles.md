# memberProfiles

2 methods on `client.memberProfiles`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getMemberProfile`

**Example:**

```typescript
    await client.memberProfiles.getMemberProfile({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f"
    })
```

**Request fields** (`GetMemberProfileRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.

### `updateMemberProfile`

**Example:**

```typescript
    await client.memberProfiles.updateMemberProfile({
        workspaceId: "64a687e29ae1f428e7ebe303",
        userId: "5a0ab5acb07987125438b60f",
        imageUrl: "https://www.url.com/imageurl-1234567890.jpg",
        removeProfileImage: false,
        userCustomFields: [{
                customFieldId: "customFieldId"
            }],
        weekStart: "MONDAY",
        workCapacity: "PT7H",
        workingDays: ["MONDAY"]
    })
```

**Request fields** (`MemberProfileUpdateRequest`):

- `workspaceId` (`string`, required) — Represents a workspace identifier across the system.
- `userId` (`string`, required) — Represents a user identifier across the system.
- `imageUrl` (`string`, optional) — Represents an image url. A field that can only be updated for limited users.
- `name` (`string`, optional) — Deprecated. Represents name of the user and can only be updated for limited users.
- `removeProfileImage` (`boolean`, optional) — Indicates whether to remove profile image or not.
- `userCustomFields` (`ClockifyApi.UpsertUserCustomFieldRequest[]`, optional) — Represents a list of upsert user custom field objects.
- `weekStart` (`ClockifyApi.UsersDayOfWeek`, optional)
- `workCapacity` (`string`, optional) — Represents work capacity as a time duration in ISO-8601 format. For example, PT7H.
- `workingDays` (`MemberProfileUpdateRequest.WorkingDays.Item[]`, optional) — Live Clockify serializes working days as an array of day enum strings; JSON-encoded strings are rejected.

