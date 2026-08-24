import type { AuthInfo } from "@modelcontextprotocol/server";

import type { Context } from "./client.js";

const INGRESS_REQUEST_META = "io.github.apet97.clockify115/request";
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/u;

export type AuthenticatedContextResolver = (authInfo: AuthInfo) => Promise<Context>;

/** Signal that authentication succeeded but this principal has no active Clockify link. */
export class PrincipalNotProvisionedError extends Error {
    constructor() {
        super("authenticated principal is not provisioned for this service");
        this.name = "PrincipalNotProvisionedError";
    }
}

/** Attach transport correlation without retaining the verified bearer secret. */
export function withIngressRequestId(authInfo: AuthInfo, requestId: string): AuthInfo {
    const validated = requireRequestId(requestId);
    return {
        ...authInfo,
        token: "",
        extra: {
            ...(isRecord(authInfo.extra) ? authInfo.extra : {}),
            [INGRESS_REQUEST_META]: { requestId: validated },
        },
    };
}

/** Read the namespaced per-request correlation metadata at the resolver boundary. */
export function ingressRequestIdFromAuth(authInfo: AuthInfo): string {
    const metadata = isRecord(authInfo.extra)
        ? authInfo.extra[INGRESS_REQUEST_META]
        : undefined;
    if (!isRecord(metadata) || typeof metadata.requestId !== "string") {
        throw new Error("authenticated request correlation metadata is absent");
    }
    return requireRequestId(metadata.requestId);
}

function requireRequestId(value: string): string {
    if (!REQUEST_ID.test(value)) {
        throw new Error("authenticated request correlation metadata is invalid");
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
