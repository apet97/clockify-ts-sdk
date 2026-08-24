export type ApplicationTable = "mcp_principals" | "mcp_credentials" | "mcp_confirmations";

type ColumnSpec = readonly [type: string, nullable: boolean, defaultValue?: string];

export const APPLICATION_COLUMNS = {
    mcp_principals: {
        id: ["uuid", false],
        issuer: ["text", false],
        subject_hash: ["character(64)", false],
        max_grant: ["text", false],
        disabled_at: ["timestamp with time zone", true],
        created_at: ["timestamp with time zone", false, "now()"],
        updated_at: ["timestamp with time zone", false, "now()"],
    },
    mcp_credentials: {
        id: ["uuid", false],
        principal_id: ["uuid", false],
        workspace_id: ["text", false],
        region: ["text", false],
        subdomain: ["text", true],
        api_key_ciphertext: ["bytea", false],
        api_key_iv: ["bytea", false],
        api_key_tag: ["bytea", false],
        key_id: ["text", false],
        revision: ["bigint", false],
        disabled_at: ["timestamp with time zone", true],
        created_at: ["timestamp with time zone", false, "now()"],
        updated_at: ["timestamp with time zone", false, "now()"],
    },
    mcp_confirmations: {
        token_hash: ["character(64)", false],
        principal_id: ["uuid", false],
        oauth_client_id: ["text", false],
        credential_id: ["uuid", false],
        credential_revision: ["bigint", false],
        workspace_id: ["text", false],
        tool_name: ["text", false],
        risk: ["text", false],
        business_args_hash: ["character(64)", false],
        preview_hash: ["character(64)", false],
        preview_bytes: ["integer", false],
        preview_ciphertext: ["bytea", false],
        preview_iv: ["bytea", false],
        preview_tag: ["bytea", false],
        key_id: ["text", false],
        expires_at: ["timestamp with time zone", false],
        created_at: ["timestamp with time zone", false, "now()"],
    },
} as const satisfies Record<ApplicationTable, Record<string, ColumnSpec>>;

export interface ConstraintSpec {
    table: ApplicationTable;
    type: "p" | "u" | "f" | "c";
    columns?: readonly string[];
    referencedTable?: ApplicationTable;
    referencedColumns?: readonly string[];
    deleteAction?: "c";
    definition?: string;
}

export const APPLICATION_CONSTRAINTS: readonly ConstraintSpec[] = [
    { table: "mcp_principals", type: "p", columns: ["id"] },
    {
        table: "mcp_principals",
        type: "u",
        columns: ["issuer", "subject_hash"],
    },
    {
        table: "mcp_principals",
        type: "c",
        definition: "CHECK (max_grant IN ('read', 'write', 'admin'))",
    },
    { table: "mcp_credentials", type: "p", columns: ["id"] },
    { table: "mcp_credentials", type: "u", columns: ["principal_id"] },
    {
        table: "mcp_credentials",
        type: "f",
        columns: ["principal_id"],
        referencedTable: "mcp_principals",
        referencedColumns: ["id"],
        deleteAction: "c",
    },
    {
        table: "mcp_credentials",
        type: "c",
        definition: "CHECK (workspace_id ~ '^[0-9a-f]{24}$')",
    },
    {
        table: "mcp_credentials",
        type: "c",
        definition: "CHECK (region IN ('global', 'eu', 'us', 'uk', 'au', 'developer'))",
    },
    {
        table: "mcp_credentials",
        type: "c",
        definition: "CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{0,62}$')",
    },
    {
        table: "mcp_credentials",
        type: "c",
        definition: "CHECK (revision > 0)",
    },
    {
        table: "mcp_credentials",
        type: "c",
        definition: "CHECK (subdomain IS NULL OR region IN ('eu', 'us', 'uk', 'au'))",
    },
    { table: "mcp_confirmations", type: "p", columns: ["token_hash"] },
    {
        table: "mcp_confirmations",
        type: "f",
        columns: ["principal_id"],
        referencedTable: "mcp_principals",
        referencedColumns: ["id"],
        deleteAction: "c",
    },
    {
        table: "mcp_confirmations",
        type: "f",
        columns: ["credential_id"],
        referencedTable: "mcp_credentials",
        referencedColumns: ["id"],
        deleteAction: "c",
    },
    {
        table: "mcp_confirmations",
        type: "c",
        definition: "CHECK (credential_revision > 0)",
    },
    {
        table: "mcp_confirmations",
        type: "c",
        definition: "CHECK (workspace_id ~ '^[0-9a-f]{24}$')",
    },
    {
        table: "mcp_confirmations",
        type: "c",
        definition:
            "CHECK (risk IN ('read', 'routine_write', 'business_write', 'external_side_effect', 'privileged', 'destructive'))",
    },
    {
        table: "mcp_confirmations",
        type: "c",
        definition: "CHECK (preview_bytes >= 0 AND preview_bytes <= 4194304)",
    },
];

export const CRITICAL_INDEXES = {
    mcp_confirmations_expires_at_idx: {
        table: "mcp_confirmations",
        columns: ["expires_at"],
    },
    mcp_confirmations_principal_idx: {
        table: "mcp_confirmations",
        columns: ["principal_id", "created_at"],
    },
    mcp_credentials_key_lookup_idx: {
        table: "mcp_credentials",
        columns: ["key_id", "id"],
    },
    mcp_confirmations_key_lookup_idx: {
        table: "mcp_confirmations",
        columns: ["key_id", "token_hash"],
    },
} as const;
