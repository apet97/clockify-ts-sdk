import { describe, expect, it } from "vitest";

import { collectPagedList } from "../src/tools/paging.js";

/**
 * `collectPagedList` termination contract. The empty-page arm mirrors
 * wrapper/iter.ts: an empty page ends the walk on EVERY branch, including
 * `Last-Page: false` — an empty page can never contain the target, and a
 * backend stuck on `Last-Page: false` must not spin to the maxPages cap.
 */

function pagedResponse<T>(items: readonly T[], lastPage?: boolean): PromiseLike<readonly T[]> {
    const promise = Promise.resolve(items);
    return {
        then: promise.then.bind(promise),
        withRawResponse: async () => ({
            data: items,
            rawResponse: {
                headers: {
                    get: (name: string) =>
                        name === "Last-Page" && lastPage !== undefined ? String(lastPage) : null,
                },
            },
        }),
    } as PromiseLike<readonly T[]>;
}

describe("collectPagedList termination", () => {
    it("stops on an empty page even when Last-Page: false claims more", async () => {
        let calls = 0;
        const rows = await collectPagedList(
            () => {
                calls += 1;
                return pagedResponse([], false);
            },
            { maxPages: 5 },
        );
        expect(rows).toEqual([]);
        expect(calls).toBe(1);
    });

    it("still trusts Last-Page: false on a short non-empty page", async () => {
        const pages: Array<{ items: number[]; last: boolean }> = [
            { items: [1, 2, 3], last: false },
            { items: [4], last: true },
        ];
        let calls = 0;
        const rows = await collectPagedList(
            (page) => {
                calls += 1;
                const p = pages[page - 1] ?? { items: [], last: true };
                return pagedResponse(p.items, p.last);
            },
            { pageSize: 200 },
        );
        expect(rows).toEqual([1, 2, 3, 4]);
        expect(calls).toBe(2);
    });

    it("falls back to the length heuristic when no header is present", async () => {
        let calls = 0;
        const rows = await collectPagedList(
            () => {
                calls += 1;
                return Promise.resolve([1, 2]);
            },
            { pageSize: 200 },
        );
        expect(rows).toEqual([1, 2]);
        expect(calls).toBe(1);
    });

    it("rejects an identical non-empty page while the server signals more", async () => {
        let calls = 0;
        await expect(
            collectPagedList(
                () => {
                    calls += 1;
                    return pagedResponse([{ id: "same" }], false);
                },
                { pageSize: 1 },
            ),
        ).rejects.toThrow(/identical|repeat/i);
        expect(calls).toBe(2);
    });

    it("does not misclassify distinct full pages as a repeated page", async () => {
        const rows = await collectPagedList(
            (page) =>
                page < 3
                    ? pagedResponse([{ id: `row-${page}` }], false)
                    : pagedResponse([{ id: "row-3" }], true),
            { pageSize: 1 },
        );
        expect(rows.map((row) => row.id)).toEqual(["row-1", "row-2", "row-3"]);
    });

    it("rejects a partial result when maxPages is exhausted", async () => {
        await expect(
            collectPagedList(
                (page) => pagedResponse([{ id: `row-${page}` }], false),
                { pageSize: 1, maxPages: 2 },
            ),
        ).rejects.toThrow(/maxPages|partial|truncat/i);
    });
});
