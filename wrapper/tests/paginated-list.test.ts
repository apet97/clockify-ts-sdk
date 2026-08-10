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

    it("toArray({ limit: 0 }) returns [] and performs no fetch", async () => {
        const pages = [["a", "b", "c"], ["d", "e", "f"], ["g"]];
        const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
            const i = (req.page ?? 1) - 1;
            return pages[i] ?? [];
        });
        const list = paginatedList(fetcher, {}, { pageSize: 3 });
        expect(await list.toArray({ limit: 0 })).toEqual([]);
        // at-most-0 must short-circuit before any page fetch.
        expect(fetcher).toHaveBeenCalledTimes(0);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid toArray limit %s",
        async (limit) => {
            const list = paginatedList(async () => ["a"], {});
            await expect(list.toArray({ limit })).rejects.toThrow(/limit.*non-negative finite integer/i);
        },
    );

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
            /pageSize must be a positive integer/,
        );
        await expect(paginatedList(fetcher, {}, { maxPages: -1 }).toArray()).rejects.toThrow(
            /maxPages must be a positive integer/,
        );
        await expect(paginatedList(fetcher, {}, { startPage: 0 }).toArray()).rejects.toThrow(
            /startPage must be a positive integer/,
        );
    });

    describe("collect()", () => {
        it("returns { items, truncated: false } for a walk that reaches the last page", async () => {
            const pages = [["a", "b"], ["c"]];
            const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
                const i = (req.page ?? 1) - 1;
                return pages[i] ?? [];
            });
            const list = paginatedList(fetcher, {}, { pageSize: 2 });
            expect(await list.collect()).toEqual({ items: ["a", "b", "c"], truncated: false });
        });

        it("returns truncated: true when maxPages stops a walk with more pages available", async () => {
            // Every page is full (pageSize items), so the server still has more —
            // maxPages: 2 cuts the walk off before it can prove completion.
            const pages = [["a", "b"], ["c", "d"], ["e", "f"]];
            const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
                const i = (req.page ?? 1) - 1;
                return pages[i] ?? [];
            });
            const list = paginatedList(fetcher, {}, { pageSize: 2, maxPages: 2 });
            expect(await list.collect()).toEqual({ items: ["a", "b", "c", "d"], truncated: true });
        });

        it("a limit-based early stop is NOT truncation — truncated stays false", async () => {
            const pages = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"], ["j"]];
            const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
                const i = (req.page ?? 1) - 1;
                return pages[i] ?? [];
            });
            const list = paginatedList(fetcher, {}, { pageSize: 3 });
            expect(await list.collect({ limit: 4 })).toEqual({
                items: ["a", "b", "c", "d"],
                truncated: false,
            });
            // limit hit during page 2 — page 3 must NOT have been fetched.
            expect(fetcher).toHaveBeenCalledTimes(2);
        });

        it("collect({ limit: 0 }) returns { items: [], truncated: false } and performs no fetch", async () => {
            const fetcher = vi.fn(async () => ["a"]);
            const list = paginatedList(fetcher, {});
            expect(await list.collect({ limit: 0 })).toEqual({ items: [], truncated: false });
            expect(fetcher).toHaveBeenCalledTimes(0);
        });

        it("still invokes an onTruncated callback passed to paginatedList — additive, not a replacement", async () => {
            const pages = [["a", "b"], ["c", "d"]];
            const fetcher = vi.fn(async (req: { page?: number; "page-size"?: number }) => {
                const i = (req.page ?? 1) - 1;
                return pages[i] ?? [];
            });
            const onTruncated = vi.fn();
            const list = paginatedList(fetcher, {}, { pageSize: 2, maxPages: 1, onTruncated });
            const result = await list.collect();
            expect(result).toEqual({ items: ["a", "b"], truncated: true });
            expect(onTruncated).toHaveBeenCalledWith({ lastPage: 1, pageSize: 2 });
        });

        it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
            "rejects invalid collect limit %s",
            async (limit) => {
                const list = paginatedList(async () => ["a"], {});
                await expect(list.collect({ limit })).rejects.toThrow(/limit.*non-negative finite integer/i);
            },
        );
    });
});
