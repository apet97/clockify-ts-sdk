import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createClockifyClient } from "../create-client.js";
import { iterAll } from "../iter.js";
import { createMockClockifyServer, type MockClockifyServer } from "../../scripts/mock-clockify-server.mjs";

let mock: MockClockifyServer;
let baseUrl: string;

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
});

afterEach(async () => {
    await mock.close();
});

describe("mock Clockify server", () => {
    it("supports health checks through the real SDK client", async () => {
        const client = createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });

        const result = await client.health();

        expect(result.ok).toBe(true);
        expect(result.user?.id).toBe(mock.userId);
    });

    it("walks paginated tags through iterAll", async () => {
        const client = createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });
        const names: string[] = [];

        for await (const tag of iterAll(client.tags.list.bind(client.tags), { workspaceId: mock.workspaceId })) {
            names.push((tag as { name?: string }).name ?? "");
        }

        expect(names).toContain("Deep Work");
        expect(names).toContain("Review");
    });
});
