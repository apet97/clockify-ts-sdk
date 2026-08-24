import { Buffer } from "node:buffer";

import {
    OAuthError,
    OAuthErrorCode,
    type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import {
    createRemoteJWKSet,
    customFetch,
    jwtVerify,
    type JWTPayload,
    type JWTVerifyGetKey,
} from "jose";

import {
    cancelReaderWithoutWaiting,
    cancelStreamWithoutWaiting,
    decodeUtf8Strict,
    readStreamChunk,
    releaseReaderLock,
} from "../bounded-stream.js";
import { requireExactHttpsUrl } from "../http-url.js";

import { readMode600Secret } from "./crypto.js";
import { isValidPrincipalSubject } from "./principal-subject.js";
import {
    REMOTE_SCOPES,
    type RemoteAuthInfo,
    type RemotePrincipal,
} from "./types.js";

const JWT_SHAPE = /^[^.]*\.[^.]*\.[^.]*$/;
const MAX_JWKS_BYTES = 256 * 1024;
const MAX_INTROSPECTION_BYTES = 64 * 1024;
const CLOCKIFY_SCOPES = new Set<string>(REMOTE_SCOPES);
const SUPPORTED_ASYMMETRIC_ALGORITHMS = new Set([
    "RS256",
    "RS384",
    "RS512",
    "PS256",
    "PS384",
    "PS512",
    "ES256",
    "ES384",
    "ES512",
    "EdDSA",
]);

interface JwtAccessTokenConfig {
    jwksUrl?: URL;
    keyResolver?: JWTVerifyGetKey;
    algorithms: readonly string[];
    fetch?: typeof fetch;
}

interface OpaqueAccessTokenConfig {
    introspectionUrl: URL;
    clientId: string;
    clientSecretFile: string;
    timeoutMs?: number;
}

interface HybridTokenVerifierOptions {
    issuer: string;
    resource: URL;
    jwt: JwtAccessTokenConfig;
    opaque: OpaqueAccessTokenConfig;
    fetch?: typeof fetch;
}

export class HybridClockifyTokenVerifier implements OAuthTokenVerifier {
    private readonly issuer: string;
    private readonly resource: URL;
    private readonly algorithms: string[];
    private readonly jwtKey: JWTVerifyGetKey;
    private readonly opaque: Omit<OpaqueAccessTokenConfig, "clientSecretFile"> & {
        clientSecret: string;
    };
    private readonly request: typeof fetch;

    private constructor(options: HybridTokenVerifierOptions, clientSecret: string) {
        this.issuer = requireExactHttpsUrl(options.issuer, "issuer").href;
        this.resource = requireExactHttpsUrl(options.resource.href, "resource URL");
        this.algorithms = requireAlgorithms(options.jwt.algorithms);
        this.jwtKey = resolveJwtKey(options.jwt);
        this.opaque = {
            clientId: options.opaque.clientId,
            ...(options.opaque.timeoutMs === undefined
                ? {}
                : { timeoutMs: options.opaque.timeoutMs }),
            clientSecret,
            introspectionUrl: requireExactHttpsUrl(
                options.opaque.introspectionUrl.href,
                "introspection URL",
            ),
        };
        if (!this.opaque.clientId || !clientSecret) {
            throw new Error("opaque-token introspection credentials are required");
        }
        this.request = options.fetch ?? fetch;
    }

    static async create(
        options: HybridTokenVerifierOptions,
    ): Promise<HybridClockifyTokenVerifier> {
        const clientSecret = await readMode600Secret(
            options.opaque.clientSecretFile,
            "OAuth introspection client secret",
        );
        return new HybridClockifyTokenVerifier(options, clientSecret);
    }

    async verifyAccessToken(token: string): Promise<RemoteAuthInfo> {
        if (!token) throw invalidToken();
        return JWT_SHAPE.test(token)
            ? await this.verifyJwt(token)
            : await this.verifyOpaque(token);
    }

    private async verifyJwt(token: string): Promise<RemoteAuthInfo> {
        let payload: JWTPayload;
        try {
            const verified = await jwtVerify(token, this.jwtKey, {
                issuer: this.issuer,
                audience: this.resource.href,
                algorithms: this.algorithms,
            });
            payload = verified.payload;
        } catch (error) {
            if (isJwksAvailabilityError(error)) throw verificationUnavailable();
            throw invalidToken();
        }
        return authInfoFromClaims(payload, this.issuer, this.resource);
    }

    private async verifyOpaque(token: string): Promise<RemoteAuthInfo> {
        const timeoutMs = positiveIntegerOr(this.opaque.timeoutMs, 5_000);
        const controller = new AbortController();
        const timeout = setTimeout(() => { controller.abort(); }, timeoutMs);
        let body: unknown;
        try {
            const response = await this.request(this.opaque.introspectionUrl, {
                method: "POST",
                headers: {
                    authorization: basicAuthorization(
                        this.opaque.clientId,
                        this.opaque.clientSecret,
                    ),
                    "content-type": "application/x-www-form-urlencoded",
                    accept: "application/json",
                },
                body: new URLSearchParams({
                    token,
                    token_type_hint: "access_token",
                }),
                redirect: "error",
                signal: controller.signal,
            });
            if (!response.ok) {
                if (response.body) cancelStreamWithoutWaiting(response.body);
                throw new Error("introspection endpoint rejected request");
            }

            const contentType = response.headers
                .get("content-type")
                ?.split(";", 1)[0]
                ?.trim()
                .toLowerCase();
            if (contentType !== "application/json") {
                if (response.body) cancelStreamWithoutWaiting(response.body);
                throw new Error("introspection response is not JSON");
            }
            const text = await readBoundedBody(
                response,
                MAX_INTROSPECTION_BYTES,
                controller.signal,
            );
            body = JSON.parse(text) as unknown;
        } catch {
            throw verificationUnavailable();
        } finally {
            clearTimeout(timeout);
        }
        if (!isRecord(body) || body.active !== true) throw invalidToken();
        if (body.iss !== this.issuer || !audienceMatches(body.aud, this.resource.href)) {
            throw invalidToken();
        }
        return authInfoFromClaims(body, this.issuer, this.resource);
    }
}

export function remotePrincipalFromAuth(authInfo: unknown): RemotePrincipal {
    if (!isRecord(authInfo)) throw invalidToken();
    const extra = authInfo.extra;
    const clockifyPrincipal = isRecord(extra) ? extra.clockifyPrincipal : undefined;
    if (
        !isRecord(clockifyPrincipal) ||
        typeof clockifyPrincipal.issuer !== "string" ||
        !isValidPrincipalSubject(clockifyPrincipal.subject) ||
        typeof authInfo.clientId !== "string" ||
        authInfo.clientId.length === 0 ||
        !Array.isArray(authInfo.scopes) ||
        !authInfo.scopes.every((scope) => typeof scope === "string")
    ) {
        throw invalidToken();
    }
    return {
        issuer: clockifyPrincipal.issuer,
        subject: clockifyPrincipal.subject,
        oauthClientId: authInfo.clientId,
        tokenScopes: new Set(authInfo.scopes),
    };
}

function resolveJwtKey(config: JwtAccessTokenConfig): JWTVerifyGetKey {
    if ((config.jwksUrl === undefined) === (config.keyResolver === undefined)) {
        throw new Error("configure exactly one JWT key resolver or JWKS URL");
    }
    if (config.keyResolver) return config.keyResolver;
    const jwksUrl = requireExactHttpsUrl(config.jwksUrl!.href, "JWKS URL");
    const boundedFetch = boundedJwksFetch(config.fetch ?? fetch);
    return createRemoteJWKSet(jwksUrl, {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60 * 1000,
        [customFetch]: boundedFetch,
    });
}

function boundedJwksFetch(request: typeof fetch): typeof fetch {
    return async (input, init) => {
        const response = await request(input, init);
        if (response.status !== 200) {
            if (response.body) cancelStreamWithoutWaiting(response.body);
            return response;
        }
        const mediaType = response.headers
            .get("content-type")
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();
        if (mediaType !== "application/json" && mediaType !== "application/jwk-set+json") {
            if (response.body) cancelStreamWithoutWaiting(response.body);
            throw new TypeError("JWKS response is not JSON");
        }
        const signal = init?.signal ?? new AbortController().signal;
        let body: string;
        try {
            body = await readBoundedBody(response, MAX_JWKS_BYTES, signal);
        } catch {
            throw new TypeError("JWKS response could not be read safely");
        }
        const headers = new Headers(response.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        headers.delete("transfer-encoding");
        return new Response(body, { status: 200, headers });
    };
}

function authInfoFromClaims(
    claims: Record<string, unknown>,
    issuer: string,
    resource: URL,
): RemoteAuthInfo {
    if (!isValidPrincipalSubject(claims.sub)) throw invalidToken();
    const subject = claims.sub;
    const clientId = requireClientId(claims);
    const expiresAt = requireEpochSeconds(claims.exp);
    const scopes = parseScopes(claims);
    if (claims.iss !== issuer || !audienceMatches(claims.aud, resource.href)) {
        throw invalidToken();
    }
    if (claims.resource !== undefined && claims.resource !== resource.href) {
        throw invalidToken();
    }
    return {
        // The serving context never needs the bearer secret after verification.
        token: "",
        clientId,
        scopes,
        expiresAt,
        resource: new URL(resource),
        extra: {
            clockifyPrincipal: { issuer, subject },
        },
    };
}

function parseScopes(claims: Record<string, unknown>): string[] {
    const scopes = new Set<string>();
    if (claims.scope !== undefined) {
        if (typeof claims.scope !== "string") throw invalidToken();
        for (const scope of claims.scope.split(/\s+/u)) {
            if (scope) scopes.add(scope);
        }
    }
    if (claims.scp !== undefined) {
        const values =
            typeof claims.scp === "string"
                ? claims.scp.split(/\s+/u)
                : Array.isArray(claims.scp)
                  ? claims.scp
                  : undefined;
        if (!values || !values.every((scope) => typeof scope === "string")) {
            throw invalidToken();
        }
        for (const scope of values) {
            if (scope) scopes.add(scope);
        }
    }
    const recognized = [...scopes].filter((scope) => CLOCKIFY_SCOPES.has(scope)).sort();
    if (recognized.length === 0) throw invalidToken();
    return recognized;
}

function requireEpochSeconds(value: unknown): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value <= Math.floor(Date.now() / 1000)
    ) {
        throw invalidToken();
    }
    return value;
}

function audienceMatches(value: unknown, resource: string): boolean {
    return (
        value === resource ||
        (Array.isArray(value) && value.length === 1 && value[0] === resource)
    );
}

function requireNonEmptyString(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) throw invalidToken();
    return value;
}

function requireClientId(claims: Record<string, unknown>): string {
    const clientId = claims.client_id;
    const authorizedParty = claims.azp;
    if (
        clientId !== undefined &&
        authorizedParty !== undefined &&
        clientId !== authorizedParty
    ) {
        throw invalidToken();
    }
    return requireNonEmptyString(clientId ?? authorizedParty);
}

function requireAlgorithms(values: readonly string[]): string[] {
    const algorithms = [...new Set(values)];
    if (
        algorithms.length === 0 ||
        algorithms.some((value) => !SUPPORTED_ASYMMETRIC_ALGORITHMS.has(value))
    ) {
        throw new Error("JWT algorithms must be an explicit asymmetric allowlist");
    }
    return algorithms;
}

function basicAuthorization(clientId: string, clientSecret: string): string {
    const encoded = `${formEncode(clientId)}:${formEncode(clientSecret)}`;
    return `Basic ${Buffer.from(encoded, "utf8").toString("base64")}`;
}

function formEncode(value: string): string {
    const encoded = new URLSearchParams({ value }).toString();
    return encoded.slice("value=".length);
}

function positiveIntegerOr(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
        ? value
        : fallback;
}

function isJwksAvailabilityError(error: unknown): boolean {
    if (error instanceof TypeError) return true;
    if (!isRecord(error) || typeof error.code !== "string") return false;
    return (
        error.code === "ERR_JWKS_TIMEOUT" ||
        error.code === "ERR_JWKS_INVALID" ||
        error.code === "ERR_JOSE_GENERIC"
    );
}

function invalidToken(): OAuthError {
    return new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");
}

function verificationUnavailable(): OAuthError {
    return new OAuthError(
        OAuthErrorCode.ServerError,
        "Access token verification is unavailable",
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBoundedBody(
    response: Response,
    maxBytes: number,
    signal: AbortSignal,
): Promise<string> {
    const declared = response.headers.get("content-length");
    if (declared !== null) {
        const bytes = Number(declared);
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxBytes) {
            if (response.body) cancelStreamWithoutWaiting(response.body);
            throw new Error("introspection response exceeds its size limit");
        }
    }
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (
            let result = await readStreamChunk(reader, signal);
            !result.done;
            result = await readStreamChunk(reader, signal)
        ) {
            const { value } = result;
            total += value.byteLength;
            if (total > maxBytes) {
                cancelReaderWithoutWaiting(reader);
                throw new Error("introspection response exceeds its size limit");
            }
            chunks.push(value);
        }
    } finally {
        if (signal.aborted) {
            cancelReaderWithoutWaiting(reader);
        }
        releaseReaderLock(reader);
    }
    return decodeUtf8Strict(Buffer.concat(chunks, total));
}
