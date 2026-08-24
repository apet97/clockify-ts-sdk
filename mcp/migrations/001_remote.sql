CREATE TABLE mcp_principals (
    id uuid PRIMARY KEY,
    issuer text NOT NULL,
    subject_hash char(64) NOT NULL,
    max_grant text NOT NULL CHECK (max_grant IN ('read', 'write', 'admin')),
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (issuer, subject_hash)
);

CREATE TABLE mcp_credentials (
    id uuid PRIMARY KEY,
    principal_id uuid NOT NULL UNIQUE REFERENCES mcp_principals(id) ON DELETE CASCADE,
    workspace_id text NOT NULL CHECK (workspace_id ~ '^[0-9a-f]{24}$'),
    region text NOT NULL CHECK (region IN ('global', 'eu', 'us', 'uk', 'au', 'developer')),
    subdomain text CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    api_key_ciphertext bytea NOT NULL,
    api_key_iv bytea NOT NULL,
    api_key_tag bytea NOT NULL,
    key_id text NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (subdomain IS NULL OR region IN ('eu', 'us', 'uk', 'au'))
);

CREATE TABLE mcp_confirmations (
    token_hash char(64) PRIMARY KEY,
    principal_id uuid NOT NULL REFERENCES mcp_principals(id) ON DELETE CASCADE,
    oauth_client_id text NOT NULL,
    credential_id uuid NOT NULL REFERENCES mcp_credentials(id) ON DELETE CASCADE,
    credential_revision bigint NOT NULL CHECK (credential_revision > 0),
    workspace_id text NOT NULL CHECK (workspace_id ~ '^[0-9a-f]{24}$'),
    tool_name text NOT NULL,
    risk text NOT NULL CHECK (
        risk IN (
            'read',
            'routine_write',
            'business_write',
            'external_side_effect',
            'privileged',
            'destructive'
        )
    ),
    business_args_hash char(64) NOT NULL,
    preview_hash char(64) NOT NULL,
    preview_bytes integer NOT NULL CHECK (
        preview_bytes >= 0 AND preview_bytes <= 4194304
    ),
    preview_ciphertext bytea NOT NULL,
    preview_iv bytea NOT NULL,
    preview_tag bytea NOT NULL,
    key_id text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mcp_confirmations_expires_at_idx
    ON mcp_confirmations (expires_at);

CREATE INDEX mcp_confirmations_principal_idx
    ON mcp_confirmations (principal_id, created_at);
