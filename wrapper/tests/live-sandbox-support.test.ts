import { describe, expect, it, vi } from "vitest";

import { resolveLiveMutationPrefix, runLiveTagRoundTrip } from "./live-sandbox-support.js";

describe("wrapper live sandbox support", () => {
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
                prefix: "",
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

    it("creates, gets, updates, and always deletes the prefixed tag", async () => {
        const calls: string[] = [];
        const result = await runLiveTagRoundTrip({
            workspaceId: "workspace",
            prefix: "clockify115-live-20260712T050607890Z-a1b2c3d4-",
            operations: {
                create: vi.fn(async (name) => {
                    calls.push(`create:${name}`);
                    return { id: "tag-id", name };
                }),
                get: vi.fn(async (tagId) => {
                    calls.push(`get:${tagId}`);
                    return {
                        id: tagId,
                        name: "clockify115-live-20260712T050607890Z-a1b2c3d4-sdk-tag",
                    };
                }),
                update: vi.fn(async (tagId, name) => {
                    calls.push(`update:${tagId}:${name}`);
                    return { id: tagId, name };
                }),
                delete: vi.fn(async (tagId) => {
                    calls.push(`delete:${tagId}`);
                }),
            },
        });

        expect(result.tagId).toBe("tag-id");
        expect(result.createdName).toBe(
            "clockify115-live-20260712T050607890Z-a1b2c3d4-sdk-tag",
        );
        expect(result.updatedName).toBe(
            "clockify115-live-20260712T050607890Z-a1b2c3d4-sdk-tag-updated",
        );
        expect(calls).toEqual([
            "create:clockify115-live-20260712T050607890Z-a1b2c3d4-sdk-tag",
            "get:tag-id",
            "update:tag-id:clockify115-live-20260712T050607890Z-a1b2c3d4-sdk-tag-updated",
            "delete:tag-id",
        ]);
    });

    it("deletes the tag when the update assertion path fails", async () => {
        const deleted: string[] = [];

        await expect(
            runLiveTagRoundTrip({
                workspaceId: "workspace",
                prefix: "clockify115-live-20260712T050607890Z-a1b2c3d4-",
                operations: {
                    create: async (name) => ({ id: "tag-id", name }),
                    get: async (tagId) => ({
                        id: tagId,
                        name: "clockify115-live-20260712T050607890Z-a1b2c3d4-sdk-tag",
                    }),
                    update: async () => {
                        throw new Error("update failed");
                    },
                    delete: async (tagId) => {
                        deleted.push(tagId);
                    },
                },
            }),
        ).rejects.toThrow("update failed");
        expect(deleted).toEqual(["tag-id"]);
    });
});
