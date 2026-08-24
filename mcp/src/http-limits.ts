const MAX_BODY_BYTES = 1024 * 1024;

export const DEFAULT_BODY_LIMIT = MAX_BODY_BYTES;
export const DEFAULT_MAX_CONCURRENT_MCP_REQUESTS = 64;

export function requireBodyLimit(value: number | undefined): number {
    const limit = value ?? DEFAULT_BODY_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BODY_BYTES) {
        throw new Error("request body limit must be between 1 byte and 1 MiB");
    }
    return limit;
}

export function requireMaxConcurrentMcpRequests(
    value: number | undefined,
): number {
    const limit = value ?? DEFAULT_MAX_CONCURRENT_MCP_REQUESTS;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
        throw new Error("maximum concurrent MCP requests must be between 1 and 10000");
    }
    return limit;
}

export function validDeclaredLength(value: string, limit: number): boolean {
    if (!/^\d+$/u.test(value)) return false;
    const bytes = Number(value);
    return Number.isSafeInteger(bytes) && bytes <= limit;
}

export function isJsonMediaType(value: string | null): boolean {
    return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}
