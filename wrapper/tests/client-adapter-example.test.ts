import { describe, expect, it } from "vitest";

import { archiveThenDeleteClient } from "../ensure.js";
import { clientArchiveThenDeleteAdapter } from "../examples/archive-then-delete-client-adapter.js";
import type { ClockifyApi } from "../requests.js";

type ExampleClient = Parameters<typeof clientArchiveThenDeleteAdapter>[0];

describe("client archive-then-delete migration example", () => {
    it("uses the replacement-body envelope and preserves every editable current field", async () => {
        const order: string[] = [];
        const updates: unknown[] = [];
        const current: ClockifyApi.Client = {
            id: "client-1",
            workspaceId: "workspace-1",
            name: "Globex",
            address: "",
            currencyCode: "USD",
            email: "finance@example.com",
            note: "",
            archived: false,
        };
        const client = {
            clients: {
                get: async (request: unknown) => {
                    order.push("getCurrent");
                    expect(request).toEqual({ workspaceId: "workspace-1", clientId: "client-1" });
                    return current;
                },
                update: async (request: unknown) => {
                    order.push("archive");
                    updates.push(request);
                    return { ...current, archived: true };
                },
                delete: async (request: unknown) => {
                    order.push("delete");
                    expect(request).toEqual({ workspaceId: "workspace-1", clientId: "client-1" });
                },
            },
        } as unknown as ExampleClient;

        await archiveThenDeleteClient({
            workspaceId: "workspace-1",
            id: "client-1",
            adapter: clientArchiveThenDeleteAdapter(client),
        });

        expect(order).toEqual(["getCurrent", "archive", "delete"]);
        expect(updates).toEqual([
            {
                workspaceId: "workspace-1",
                clientId: "client-1",
                body: {
                    name: "Globex",
                    address: "",
                    currencyCode: "USD",
                    email: "finance@example.com",
                    note: "",
                    archived: true,
                },
            },
        ]);
    });
});
