# holidays

5 methods on `client.holidays`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getWorkspaceHolidays`

**Example:**

```typescript
    await client.holidays.getWorkspaceHolidays({
        workspaceId: "workspaceId",
        "assigned-to": "60f924bafdaf031696ec6218"
    })
```

**Request fields** (`GetWorkspaceHolidaysRequest`):

- `workspaceId` (`string`, required)
- `assigned-to` (`string`, optional) — If provided, returns a filtered list of holidays assigned to the user.
- `page` (`number`, optional) — 1-based page index. Default 1.
- `page-size` (`number`, optional) — Page size (number of items per page). Default 50; maximum 200.

### `createHoliday`

**Example:**

```typescript
    await client.holidays.createHoliday({
        workspaceId: "workspaceId",
        automaticTimeEntryCreation: {
            defaultEntities: {
                projectId: "65b36d3c525e243c48f9150f",
                taskId: "65b36d46fa3df8607e42d21a"
            },
            enabled: false
        },
        color: "#8BC34A",
        datePeriod: {
            endDate: "2024-05-01",
            startDate: "2024-05-01"
        },
        everyoneIncludingNew: true,
        name: "Labour Day",
        occursAnnually: true,
        userGroups: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791342"],
            status: "ACTIVE"
        },
        users: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791432"],
            status: "ACTIVE"
        }
    })
```

**Request fields** (`CreateHolidayRequest`):

- `workspaceId` (`string`, required)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `datePeriod` (`ClockifyApi.DatePeriodRequest`, required)
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether the holiday is shown to new users.
- `name` (`string`, required) — Provide the name of the holiday.
- `occursAnnually` (`boolean`, optional) — Indicates whether the holiday occurs annually.
- `userGroups` (`ClockifyApi.UserGroupIdsSchema`, optional)
- `users` (`ClockifyApi.UserIdsSchema`, optional)

### `getWorkspaceHolidaysInPeriod`

**Example:**

```typescript
    await client.holidays.getWorkspaceHolidaysInPeriod({
        workspaceId: "workspaceId",
        "assigned-to": "60f924bafdaf031696ec6218",
        start: "2022-12-03T10:59:59Z",
        end: "2022-12-05T23:59:59Z"
    })
```

**Request fields** (`GetWorkspaceHolidaysInPeriodRequest`):

- `workspaceId` (`string`, required)
- `assigned-to` (`string`, required)
- `start` (`string`, required) — Filter list of holidays starting from start date. Expected date format yyyy-MM-ddThh:mm:ssZ.
- `end` (`string`, required) — Filter list of holidays ending by end date. Expected date format yyyy-MM-ddThh:mm:ssZ.

### `updateHoliday`

**Example:**

```typescript
    await client.holidays.updateHoliday({
        workspaceId: "workspaceId",
        holidayId: "holidayId",
        automaticTimeEntryCreation: {
            defaultEntities: {
                projectId: "65b36d3c525e243c48f9150f",
                taskId: "65b36d46fa3df8607e42d21a"
            },
            enabled: false
        },
        color: "#8BC34A",
        datePeriod: {
            endDate: "2024-01-01",
            startDate: "2024-01-01"
        },
        everyoneIncludingNew: false,
        name: "New Year's Day",
        occursAnnually: true,
        userGroups: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791342"],
            status: "ACTIVE"
        },
        users: {
            contains: "CONTAINS",
            ids: ["5b715612b079875110791432"],
            status: "ACTIVE"
        }
    })
```

**Request fields** (`UpdateHolidayRequest`):

- `workspaceId` (`string`, required)
- `holidayId` (`string`, required)
- `automaticTimeEntryCreation` (`ClockifyApi.AutomaticTimeEntryCreationRequest`, optional)
- `color` (`string`, optional) — Color value in standard RGB hexadecimal format.
- `datePeriod` (`ClockifyApi.DatePeriodRequest`, required)
- `everyoneIncludingNew` (`boolean`, optional) — Indicates whether the holiday is shown to new users.
- `name` (`string`, required) — Provide the name you would like to use for updating the holiday.
- `occursAnnually` (`boolean`, required) — Indicates whether the holiday occurs annually.
- `userGroups` (`ClockifyApi.ContainsUserGroupFilterRequest`, optional)
- `users` (`ClockifyApi.ContainsUsersFilterRequestForHoliday`, optional)

### `deleteHoliday`

**Example:**

```typescript
    await client.holidays.deleteHoliday({
        workspaceId: "workspaceId",
        holidayId: "holidayId"
    })
```

**Request fields** (`DeleteHolidayRequest`):

- `workspaceId` (`string`, required)
- `holidayId` (`string`, required)

