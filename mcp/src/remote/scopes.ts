import type { ToolRisk } from "../tool-risk.js";

import { REMOTE_SCOPES, type RemoteScope, type ScopeGrant } from "./types.js";

const GRANT_RANK: Record<ScopeGrant, number> = {
    read: 0,
    write: 1,
    admin: 2,
};

const SCOPE_GRANT: Record<RemoteScope, ScopeGrant> = {
    [REMOTE_SCOPES[0]]: "read",
    [REMOTE_SCOPES[1]]: "write",
    [REMOTE_SCOPES[2]]: "admin",
};

export function effectiveScopes(
    tokenScopes: ReadonlySet<string>,
    maxGrant: ScopeGrant,
): ReadonlySet<RemoteScope> {
    return new Set(
        (Object.entries(SCOPE_GRANT) as Array<[RemoteScope, ScopeGrant]>)
            .filter(
                ([scope, grant]) =>
                    tokenScopes.has(scope) && GRANT_RANK[grant] <= GRANT_RANK[maxGrant],
            )
            .map(([scope]) => scope),
    );
}

export function requiredScopeForRisk(risk: ToolRisk): RemoteScope {
    switch (risk) {
        case "read":
            return REMOTE_SCOPES[0];
        case "routine_write":
        case "business_write":
        case "external_side_effect":
            return REMOTE_SCOPES[1];
        case "privileged":
        case "destructive":
            return REMOTE_SCOPES[2];
    }
}
