import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";

import { createMockClockifyServer, type MockClockifyServer } from "../../scripts/mock-clockify-server.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(
    readFileSync(path.join(repoRoot, "docs/mock-clockify-contract.json"), "utf8"),
) as { requiredRoutes: string[] };

let mock: MockClockifyServer;
let baseUrl: string;

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
});

afterEach(async () => {
    await mock.close();
});

it("serves every contract requiredRoute against the live mock (no 404)", async () => {
    const tagId = (mock.state.tags[0]?.id ?? "000000000000000000000101") as string;
    const invoiceId = (mock.state.invoices[0]?.id ?? "000000000000000000000401") as string;
    for (const route of contract.requiredRoutes) {
        const [method = "GET", routePath = ""] = route.split(" ");
        const concretePath = routePath
            .replaceAll("{workspaceId}", mock.workspaceId)
            .replaceAll("{tagId}", tagId)
            .replaceAll("{invoiceId}", invoiceId);
        const response = await fetch(`${baseUrl}${concretePath}`, {
            method,
            headers: { "X-Api-Key": "mock" },
        });
        await response.text().catch(() => {});
        expect(response.status, `${route} should be served by the mock`).not.toBe(404);
    }
});
