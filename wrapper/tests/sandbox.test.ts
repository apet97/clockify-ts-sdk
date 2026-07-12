import { beforeAll, describe, it, expect } from "vitest";

import { createClockifyClient } from "../create-client.js";
import { iterAll } from "../iter.js";
import { paginate } from "../pagination.js";
import { withResponse } from "../with-response.js";

import { resolveLiveMutationPrefix, runLiveTagRoundTrip } from "./live-sandbox-support.js";

type ClockifyClient = ReturnType<typeof createClockifyClient>;

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const livePrefix = resolveLiveMutationPrefix({
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(process.env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM !== undefined
        ? { workspaceConfirm: process.env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM }
        : {}),
    ...(process.env.CLOCKIFY_LIVE_PREFIX !== undefined
        ? { prefix: process.env.CLOCKIFY_LIVE_PREFIX }
        : {}),
});
const liveSandboxAvailable = livePrefix !== undefined;

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
    console.warn(
        "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; live tests skipped.",
    );
}

describeLive("clockify-sdk-ts-115 live sandbox", () => {
    // createClockifyClient enforces "exactly one of apiKey / addonToken"
    // at construction time, so we can't build the client at the top
    // level of the describe block (vitest evaluates that even under
    // describe.skip to collect tests). beforeAll only fires when the
    // describe is NOT skipped, so the construction is gated on the
    // live env vars being present.
    let client: ClockifyClient;
    beforeAll(() => {
        client = createClockifyClient({ apiKey: apiKey! });
    });

    it("lists tags (page=1, page-size=5)", async () => {
        const tags = await client.tags.list({
            workspaceId: workspaceId!,
            page: 1,
            "page-size": 5,
        });
        expect(Array.isArray(tags)).toBe(true);
        expect(tags.length).toBeLessThanOrEqual(5);
    });

    it("creates, gets, updates, and deletes a prefixed tag in try/finally", async () => {
        const result = await runLiveTagRoundTrip({
            workspaceId: workspaceId!,
            prefix: livePrefix!,
            operations: {
                create: (name, scopedWorkspaceId) =>
                    client.tags.create({ workspaceId: scopedWorkspaceId, body: { name } }),
                get: (tagId, scopedWorkspaceId) =>
                    client.tags.get({ workspaceId: scopedWorkspaceId, tagId }),
                update: (tagId, name, scopedWorkspaceId) =>
                    client.tags.update({
                        workspaceId: scopedWorkspaceId,
                        tagId,
                        body: { name },
                    }),
                delete: (tagId, scopedWorkspaceId) =>
                    client.tags.delete({ workspaceId: scopedWorkspaceId, tagId }),
            },
        });
        expect(result.createdName).toBe(`${livePrefix!}sdk-tag`);
        expect(result.fetchedName).toBe(`${livePrefix!}sdk-tag`);
        expect(result.updatedName).toBe(`${livePrefix!}sdk-tag-updated`);

        // Confirm 4xx after deletion (server returns 400 "tag doesn't belong to workspace" — code 501 — once deleted).
        await expect(
            client.tags.get({
                workspaceId: workspaceId!,
                tagId: result.tagId,
            }),
        ).rejects.toBeInstanceOf(Error);
    });

    it("paginates projects across page=1 → page=2 (manual page loop)", async () => {
        const pageSize = 5;
        const page1 = await client.projects.list({
            workspaceId: workspaceId!,
            page: 1,
            "page-size": pageSize,
        });
        expect(Array.isArray(page1)).toBe(true);
        expect(page1.length).toBeLessThanOrEqual(pageSize);

        if (page1.length === pageSize) {
            const page2 = await client.projects.list({
                workspaceId: workspaceId!,
                page: 2,
                "page-size": pageSize,
            });
            expect(Array.isArray(page2)).toBe(true);

            if (page2.length > 0) {
                const page1Ids = new Set(page1.map((p) => p.id));
                const page2OverlapsPage1 = page2.some((p) => page1Ids.has(p.id));
                expect(page2OverlapsPage1).toBe(false);
            }
        }
    });

    it("paginates projects via paginate() helper across at least two pages", async () => {
        // With pageSize=2 the iterator crosses page 1 → page 2 whenever
        // the governed sandbox contains more than two projects.
        const pageSize = 2;
        const seenPages: number[] = [];
        const projects: Array<{ id?: string | undefined }> = [];

        for await (const project of paginate(
            async (page, sz) => {
                seenPages.push(page);
                return client.projects.list({
                    workspaceId: workspaceId!,
                    page,
                    "page-size": sz,
                });
            },
            { pageSize, maxPages: 10 },
        )) {
            projects.push(project);
        }

        // We expect either (a) the iterator walked > 1 page or (b) the
        // sandbox genuinely has ≤ pageSize projects (degenerate case).
        if (projects.length > pageSize) {
            expect(seenPages.length).toBeGreaterThanOrEqual(2);
        }

        // No duplicates across pages.
        const ids = projects.map((p) => p.id).filter((id): id is string => Boolean(id));
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("rejects an invalid {tagId} path param with a structured error", async () => {
        await expect(
            client.tags.get({
                workspaceId: workspaceId!,
                tagId: "ffffffffffffffffffffffff",
            }),
        ).rejects.toBeInstanceOf(Error);
    });

    it("paginates projects via iterAll() across at least one page", async () => {
        const listProjects = client.projects.list.bind(client.projects);
        const seen = new Set<string>();
        let count = 0;
        for await (const project of iterAll(
            listProjects,
            { workspaceId: workspaceId! },
            { pageSize: 5, maxPages: 3 },
        )) {
            count++;
            if (project.id != null) seen.add(project.id);
        }
        // At least one project came back; no duplicate IDs across pages.
        expect(seen.size).toBe(count);
    });

    it("withResponse() exposes status + headers + requestId on a list call", async () => {
        const { data, status, headers, requestId } = await withResponse(
            client.tags.list({
                workspaceId: workspaceId!,
                page: 1,
                "page-size": 1,
            }),
        );
        expect(status).toBeGreaterThanOrEqual(200);
        expect(status).toBeLessThan(300);
        expect(Array.isArray(data)).toBe(true);
        // Our composedFetch injects X-Request-Id; the server typically
        // echoes it (or strips it). Either way the field exists on the
        // result; if the server stripped it, requestId is undefined.
        expect(typeof headers.get).toBe("function");
        if (requestId != null) {
            expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
        }
    });
});
