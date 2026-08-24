CREATE INDEX mcp_credentials_key_lookup_idx
    ON mcp_credentials (key_id, id);

CREATE INDEX mcp_confirmations_key_lookup_idx
    ON mcp_confirmations (key_id, token_hash);
