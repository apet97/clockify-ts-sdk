import { describe, expect, it, vi } from "vitest";

import {
    cleanupCliLiveResources,
    entitlementMarker,
    isEntitlementUnavailable,
    requireReceiptId,
    resolveLiveMutationPrefix,
} from "./live-sandbox-support.js";

describe("CLI live sandbox support", () => {
    it("recognizes only the stable feature code or HTTP 402 as an entitlement limitation", () => {
        expect(isEntitlementUnavailable({ code: "feature_unavailable" })).toBe(true);
        expect(isEntitlementUnavailable({ statusCode: 402 })).toBe(true);
        expect(isEntitlementUnavailable(new Error('{"code":"feature_unavailable"}'))).toBe(true);

        expect(isEntitlementUnavailable({ statusCode: 403 })).toBe(false);
        expect(isEntitlementUnavailable({ statusCode: 404 })).toBe(false);
        expect(isEntitlementUnavailable(new Error("workspace plan does not allow this"))).toBe(
            false,
        );
        expect(isEntitlementUnavailable(new Error("HTTP 403 not allowed"))).toBe(false);
        expect(isEntitlementUnavailable(new Error("HTTP 404 not found"))).toBe(false);
        expect(entitlementMarker({ code: "feature_unavailable" })).toBe(
            "CLOCKIFY_LIVE_ENTITLEMENT:feature_unavailable",
        );
        expect(entitlementMarker({ statusCode: 402 })).toBe("CLOCKIFY_LIVE_ENTITLEMENT:http_402");
        expect(entitlementMarker({ statusCode: 403 })).toBeUndefined();
    });

    it("requires an orchestrator prefix and matching workspace confirmation", () => {
        expect(
            resolveLiveMutationPrefix({
                apiKey: "key",
                workspaceId: "workspace",
                workspaceConfirm: "workspace",
                prefix: "clockify115-live-20260712T050607890Z-a1b2c3d4-",
            }),
        ).toBe("clockify115-live-20260712T050607890Z-a1b2c3d4-");
        expect(() =>
            resolveLiveMutationPrefix({
                apiKey: "key",
                workspaceId: "workspace",
                workspaceConfirm: "different",
                prefix: "clockify115-live-20260712T050607890Z-a1b2c3d4-",
            }),
        ).toThrow("unconfirmed");
        expect(() =>
            resolveLiveMutationPrefix({
                apiKey: "key",
                workspaceId: "workspace",
                workspaceConfirm: "workspace",
            }),
        ).toThrow("prefix");
        expect(() =>
            resolveLiveMutationPrefix({
                apiKey: "key",
                workspaceId: "workspace",
                workspaceConfirm: "workspace",
                prefix: "clockify115-live-unsafe path-",
            }),
        ).toThrow("prefix");
        expect(resolveLiveMutationPrefix({})).toBeUndefined();
    });

    it("reads non-empty IDs from structured CLI receipts", () => {
        expect(requireReceiptId({ ids: { entryId: "entry-id" } }, "entryId")).toBe("entry-id");
        expect(() => requireReceiptId({ ids: { entryId: "" } }, "entryId")).toThrow("entryId");
        expect(() => requireReceiptId([], "entryId")).toThrow("entryId");
    });

    it("cleans SDK resources in dependency order", async () => {
        const calls: string[] = [];
        const cleanup = (kind: string) => vi.fn(async (id: string) => calls.push(`${kind}:${id}`));

        await cleanupCliLiveResources(
            {
                entryId: "entry",
                invoiceId: "invoice",
                task: { projectId: "project", taskId: "task" },
                projectId: "project",
                clientId: "client",
                tagId: "tag",
            },
            {
                deleteEntry: cleanup("entry"),
                deleteInvoice: cleanup("invoice"),
                deleteTask: async ({ taskId }) => {
                    calls.push(`task:${taskId}`);
                },
                deleteProject: cleanup("project"),
                deleteClient: cleanup("client"),
                deleteTag: cleanup("tag"),
            },
        );

        expect(calls).toEqual([
            "entry:entry",
            "invoice:invoice",
            "task:task",
            "project:project",
            "client:client",
            "tag:tag",
        ]);
    });

    it("attempts later SDK cleanup after one resource fails", async () => {
        const calls: string[] = [];

        await expect(
            cleanupCliLiveResources(
                { invoiceId: "invoice", clientId: "client" },
                {
                    deleteEntry: vi.fn(),
                    deleteInvoice: async () => {
                        calls.push("invoice");
                        throw new Error("invoice cleanup failed");
                    },
                    deleteTask: vi.fn(),
                    deleteProject: vi.fn(),
                    deleteClient: async () => {
                        calls.push("client");
                    },
                    deleteTag: vi.fn(),
                },
            ),
        ).rejects.toThrow("CLI live sandbox cleanup failed");
        expect(calls).toEqual(["invoice", "client"]);
    });
});
