/**
 * HTTP wire-shape breadth traps for generated SDK list methods.
 *
 * These drive the real generated clients against the mock server so the fixture
 * assertions are not only static: projects stay bare arrays, invoices stay
 * envelope-shaped, and the in-progress time-entry route keeps the hyphenated
 * `page-size` query parameter wired.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    createMockClockifyServer,
    type MockClockifyServer,
} from "../../scripts/mock-clockify-server.mjs";
import { createClockifyClient } from "../create-client.js";

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

describe("generated list wire shapes over HTTP", () => {
    it("projects.list deserializes as a bare array", async () => {
        const c = client();
        const projects = (await c.projects.list({
            workspaceId: mock.workspaceId,
        } as Parameters<typeof c.projects.list>[0])) as unknown;

        expect(Array.isArray(projects)).toBe(true);
        expect((projects as unknown[])[0]).toMatchObject({
            id: expect.any(String),
            name: expect.any(String),
            clientId: expect.any(String),
            archived: expect.any(Boolean),
        });
    });

    it("invoices.list deserializes as a { invoices, total } envelope", async () => {
        const c = client();
        const response = (await c.invoices.list({
            workspaceId: mock.workspaceId,
        })) as unknown as Record<string, unknown>;

        expect(Array.isArray(response)).toBe(false);
        expect(Array.isArray(response.invoices)).toBe(true);
        expect(response.total).toBe(1);
    });

    it("timeEntries.listInProgress honors page-size paging", async () => {
        const c = client();
        mock.state.entries.push(
            { id: "000000000000000000000a01" },
            { id: "000000000000000000000a02" },
        );

        const entries = await c.timeEntries.listInProgress({
            workspaceId: mock.workspaceId,
            page: 1,
            "page-size": 1,
        });

        expect(entries).toEqual([{ id: "000000000000000000000a01" }]);
    });
});
