# policies

6 methods on `client.policies`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `getWorkspacesWorkspaceIdPolicies`

**Example:**

```typescript
    await client.policies.getWorkspacesWorkspaceIdPolicies({
        workspaceId: "workspaceId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdPoliciesRequest`):

- `workspaceId` (`string`, required)
- `archived` (`boolean`, optional)

### `postWorkspacesWorkspaceIdPolicies`

**Example:**

```typescript
    await client.policies.postWorkspacesWorkspaceIdPolicies({
        workspaceId: "workspaceId",
        body: {}
    })
```

**Request fields** (`PostWorkspacesWorkspaceIdPoliciesRequest`):

- `workspaceId` (`string`, required)
- `body` (`ClockifyApi.TimeOffPolicy`, required)

### `getWorkspacesWorkspaceIdPoliciesPolicyId`

**Example:**

```typescript
    await client.policies.getWorkspacesWorkspaceIdPoliciesPolicyId({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`GetWorkspacesWorkspaceIdPoliciesPolicyIdRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)

### `putWorkspacesWorkspaceIdPoliciesPolicyId`

**Example:**

```typescript
    await client.policies.putWorkspacesWorkspaceIdPoliciesPolicyId({
        workspaceId: "workspaceId",
        policyId: "policyId",
        body: {}
    })
```

**Request fields** (`PutWorkspacesWorkspaceIdPoliciesPolicyIdRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `body` (`ClockifyApi.TimeOffPolicy`, required)

### `deleteWorkspacesWorkspaceIdPoliciesPolicyId`

**Example:**

```typescript
    await client.policies.deleteWorkspacesWorkspaceIdPoliciesPolicyId({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`DeleteWorkspacesWorkspaceIdPoliciesPolicyIdRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)

### `patchWorkspacesWorkspaceIdPoliciesPolicyIdArchive`

**Example:**

```typescript
    await client.policies.patchWorkspacesWorkspaceIdPoliciesPolicyIdArchive({
        workspaceId: "workspaceId",
        policyId: "policyId"
    })
```

**Request fields** (`PatchWorkspacesWorkspaceIdPoliciesPolicyIdArchiveRequest`):

- `workspaceId` (`string`, required)
- `policyId` (`string`, required)
- `archived` (`boolean`, optional)

