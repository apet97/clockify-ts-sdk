import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    createMockClockifyServer,
    type MockClockifyServer,
} from "../../scripts/mock-clockify-server.mjs";
import { createClockifyClient } from "../create-client.js";
import {
    classifyClockifyError,
    getStableErrorCode,
    InternalServerError,
    isRateLimitError,
    promoteApiError,
    RateLimitError,
    ServiceUnavailableError,
} from "../errors.js";
import { UnauthorizedError } from "../src/api/errors/index.js";
import { ClockifyApiError } from "../src/errors/index.js";

let mock: MockClockifyServer;
let baseUrl: string;

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
});

afterEach(async () => {
    await mock.close();
});

function client() {
    return createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });
}

async function callWithStatus(status: number): Promise<unknown> {
    try {
        await client().users.getCurrentUser(undefined, {
            headers: { "X-Mock-Status": String(status) },
        });
        throw new Error(`expected HTTP ${status} to throw`);
    } catch (error) {
        return error;
    }
}

describe("error decode over HTTP: 429", () => {
    it("promotes a real 429 response to RateLimitError with parsed Retry-After", async () => {
        const raw = await callWithStatus(429);

        expect(raw).toBeInstanceOf(ClockifyApiError);
        expect((raw as ClockifyApiError).statusCode).toBe(429);

        const promoted = promoteApiError(raw);
        expect(promoted).toBeInstanceOf(RateLimitError);
        expect(isRateLimitError(promoted)).toBe(true);
        expect((promoted as RateLimitError).retryAfterMs).toBe(30_000);
        expect(getStableErrorCode(raw)).toBe("rate_limited_retry_after");
        expect(classifyClockifyError(raw)?.retryable).toBe(true);
    });
});

describe("error decode over HTTP: 401", () => {
    it("decodes a real 401 to UnauthorizedError and auth_or_permission", async () => {
        const raw = await callWithStatus(401);

        expect(raw).toBeInstanceOf(UnauthorizedError);
        expect((raw as ClockifyApiError).statusCode).toBe(401);
        expect(getStableErrorCode(raw)).toBe("auth_or_permission");
    });
});

describe("error decode over HTTP: 500 / 503", () => {
    it("promotes 500 to InternalServerError and clockify_upstream_error", async () => {
        const raw = await callWithStatus(500);

        expect((raw as ClockifyApiError).statusCode).toBe(500);
        expect(promoteApiError(raw)).toBeInstanceOf(InternalServerError);
        expect(getStableErrorCode(raw)).toBe("clockify_upstream_error");
    });

    it("promotes 503 to ServiceUnavailableError and clockify_upstream_error", async () => {
        const raw = await callWithStatus(503);

        expect((raw as ClockifyApiError).statusCode).toBe(503);
        expect(promoteApiError(raw)).toBeInstanceOf(ServiceUnavailableError);
        expect(getStableErrorCode(raw)).toBe("clockify_upstream_error");
    });
});
