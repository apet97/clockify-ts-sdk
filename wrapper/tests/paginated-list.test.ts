import { describe, expect, it, vi } from "vitest";

import { paginatedList, PaginatedList } from "../paginated-list.js";

describe("PaginatedList", () => {
    it("yields items across multiple pages via for-await", async () => {
        const pages = [["a", "b", "c"], ["d", "e", "f"], ["g"]];
        const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        });
        const list = paginatedList(fetcher, {}, { pageSize: 3 });
        const collected: string[] = [];
        for await (const item of list) collected.push(item);
        expect(collected).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
        // Three full-page fetches: pages 1+2 returned 3 items each
        // (full → "maybe more"), page 3 returned 1 (< pageSize → stop).
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("toArray({ limit }) stops early and avoids extra fetches", async () => {
        const pages = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"], ["j"]];
        const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        });
        const list = paginatedList(fetcher, {}, { pageSize: 3 });
        const first4 = await list.toArray({ limit: 4 });
        expect(first4).toEqual(["a", "b", "c", "d"]);
        // limit hit during page 2 — page 3 must NOT have been fetched.
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("toArray() with no limit walks until the last page", async () => {
        const pages = [["a", "b"], ["c"]];
        const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        });
        const list = paginatedList(fetcher, {}, { pageSize: 2 });
        expect(await list.toArray()).toEqual(["a", "b", "c"]);
    });

    it("pages() yields per-page envelopes", async () => {
        const pages = [["x", "y"], ["z"]];
        const fetcher = async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        };
        const list = paginatedList(fetcher, {}, { pageSize: 2 });
        const envelopes = [];
        for await (const env of list.pages()) envelopes.push(env);
        expect(envelopes).toEqual([
            { items: ["x", "y"], page: 1, pageSize: 2, hasNextPage: true },
            { items: ["z"], page: 2, pageSize: 2, hasNextPage: false },
        ]);
    });

    it("is a PaginatedList instance (for instanceof checks)", () => {
        const list = paginatedList(async () => [], {});
        expect(list).toBeInstanceOf(PaginatedList);
    });

    it("propagates fetcher errors", async () => {
        const fetcher = async () => {
            throw new Error("boom");
        };
        const list = paginatedList(fetcher, {});
        await expect(list.toArray()).rejects.toThrow("boom");
    });

    it("rejects invalid pageSize / maxPages / startPage at iteration time", async () => {
        const fetcher = async () => [];
        await expect(paginatedList(fetcher, {}, { pageSize: 0 }).toArray()).rejects.toThrow(
            /pageSize must be > 0/,
        );
        await expect(paginatedList(fetcher, {}, { maxPages: -1 }).toArray()).rejects.toThrow(
            /maxPages must be > 0/,
        );
        await expect(paginatedList(fetcher, {}, { startPage: 0 }).toArray()).rejects.toThrow(
            /startPage must be > 0/,
        );
    });
});
