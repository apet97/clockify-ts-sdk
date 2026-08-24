import { buildRoutingOptions, createContext } from "../client.js";
import {
    ingressRequestIdFromAuth,
    type AuthenticatedContextResolver,
} from "../http-context.js";
import { ToolAuthorizationError } from "../tool-authorization.js";

import { remotePrincipalFromAuth } from "./auth.js";
import { PostgresConfirmationStore } from "./confirmations.js";
import { PostgresCredentialStore } from "./credentials.js";
import type { AesGcmKeyring } from "./crypto.js";
import { effectiveScopes, requiredScopeForRisk } from "./scopes.js";
import type { SqlPool } from "./types.js";

const DEFAULT_CLOCKIFY_TIMEOUT_SECONDS = 180;
interface PostgresContextResolverOptions {
    pool: SqlPool;
    keyring: AesGcmKeyring;
    issuer: string;
    fetch?: typeof fetch;
    clockifyTimeoutSeconds?: number;
}

/** Resolve one bearer identity to one pinned, encrypted Clockify credential. */
export function createPostgresContextResolver(
    options: PostgresContextResolverOptions,
): AuthenticatedContextResolver {
    const clockifyTimeoutSeconds = requireClockifyTimeout(
        options.clockifyTimeoutSeconds ?? DEFAULT_CLOCKIFY_TIMEOUT_SECONDS,
    );
    const credentials = new PostgresCredentialStore(
        options.pool,
        options.keyring,
        options.issuer,
    );
    return async (authInfo) => {
        const requestId = ingressRequestIdFromAuth(authInfo);
        const principal = remotePrincipalFromAuth(authInfo);
        const credential = await credentials.load(principal);
        const scopes = effectiveScopes(principal.tokenScopes, credential.maxGrant);
        const confirmationStore = new PostgresConfirmationStore(
            options.pool,
            options.keyring,
            {
                principalId: credential.principalId,
                oauthClientId: principal.oauthClientId,
                credentialId: credential.credentialId,
                credentialRevision: credential.credentialRevision,
                workspaceId: credential.workspaceId,
            },
        );
        const routing = buildRoutingOptions(credential.region, credential.subdomain);
        if (routing === undefined) {
            throw new Error("stored Clockify routing profile is invalid");
        }
        return createContext({
            apiKey: credential.apiKey,
            workspaceId: credential.workspaceId,
            routing,
            confirmationStore,
            timeoutInSeconds: clockifyTimeoutSeconds,
            requestId,
            ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
            authorizeTool: ({ risk }) => {
                const required = requiredScopeForRisk(risk);
                if (!scopes.has(required)) {
                    throw new ToolAuthorizationError(
                        `this tool requires the ${required} scope and matching database grant`,
                    );
                }
            },
        });
    };
}

function requireClockifyTimeout(value: number): number {
    if (!Number.isFinite(value) || value <= 0 || value > 600) {
        throw new Error("Clockify request timeout must be greater than 0 and at most 600 seconds");
    }
    return value;
}
