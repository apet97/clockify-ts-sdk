import type { AuthInfo } from "@modelcontextprotocol/server";

export const REMOTE_SCOPES = [
    "clockify:read",
    "clockify:write",
    "clockify:admin",
] as const;

export type RemoteScope = (typeof REMOTE_SCOPES)[number];
export type ScopeGrant = "read" | "write" | "admin";

export interface RemotePrincipal {
    issuer: string;
    subject: string;
    oauthClientId: string;
    tokenScopes: ReadonlySet<string>;
}

export interface RemoteAuthInfo extends AuthInfo {
    extra: Record<string, unknown> & {
        clockifyPrincipal: {
            issuer: string;
            subject: string;
        };
    };
}

export interface ClockifyCredentialInput {
    workspaceId: string;
    apiKey: string;
    region?: "global" | "eu" | "us" | "uk" | "au" | "developer";
    subdomain?: string;
}

export interface LoadedClockifyCredential
    extends Omit<ClockifyCredentialInput, "region"> {
    principalId: string;
    credentialId: string;
    credentialRevision: bigint;
    region: NonNullable<ClockifyCredentialInput["region"]>;
    maxGrant: ScopeGrant;
}

export interface QueryResult<Row> {
    rows: Row[];
    rowCount: number | null;
}

export interface SqlQueryable {
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
    ): Promise<QueryResult<Row>>;
}

export interface SqlConnection extends SqlQueryable {
    release(): void;
}

export interface SqlPool extends SqlQueryable {
    connect(): Promise<SqlConnection>;
    end(): Promise<void>;
}
