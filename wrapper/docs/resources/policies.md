# policies

6 methods on `client.policies`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `list`

**Example:**

```typescript
    await client.policies.list({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`ListPoliciesRequest`):

- `workspaceId` (`string`, required)
- `archived` (`boolean`, optional)

### `create`

**Example:**

```typescript
    await client.policies.create({
        workspaceId: "workspaceId",
        body: {}
    })
```

**Request fields** (`CreatePoliciesRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.TimeOffPolicy`, required)

### `get`

**Example:**

```typescript
    await client.policies.get({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`GetPoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)

### `update`

**Example:**

```typescript
    await client.policies.update({
        workspaceId: "workspaceId",
        policyId: "policyId",
        body: {}
    })
```

**Request fields** (`UpdatePoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`ClockifyApi.TimeOffPolicy`, required)

### `delete`

**Example:**

```typescript
    await client.policies.delete({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`DeletePoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)

### `archive`

**Example:**

```typescript
    await client.policies.archive({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`ArchivePoliciesRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `archived` (`boolean`, optional)

