import { describe, expect, it, vi } from "vitest";

import { createClockifyClient } from "../create-client.js";
import { iterAll, iterPages, KNOWN_PAGINATED_METHODS, type PaginatedRequest } from "../iter.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) out.push(item);
    return out;
}

describe("iterAll", () => {
    it("yields items from a single page and stops on a partial page", async () => {
        const seen: Array<{ page: number; pageSize: number }> = [];
        const fetcher = async (req: PaginatedRequest) => {
            seen.push({ page: req.page!, pageSize: req["page-size"]! });
            if (req.page === 1) return [1, 2, 3];
            return [];
        };
        const items = await collect(iterAll(fetcher, {}));
        expect(items).toEqual([1, 2, 3]);
        expect(seen).toEqual([{ page: 1, pageSize: 50 }]);
    });

    it("walks multiple pages and stops on the first non-full page", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3, 4], 3: [5] };
        const seen: number[] = [];
        const fetcher = async (req: PaginatedRequest) => {
            seen.push(req.page!);
            return dataset[req.page!] ?? [];
        };
        const items = await collect(iterAll(fetcher, {}, { pageSize: 2 }));
        expect(items).toEqual([1, 2, 3, 4, 5]);
        expect(seen).toEqual([1, 2, 3]);
    });

    it("walks until an empty page when every page is exactly pageSize", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3, 4], 3: [] };
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];
        const items = await collect(iterAll(fetcher, {}, { pageSize: 2 }));
        expect(items).toEqual([1, 2, 3, 4]);
    });

    it("respects maxPages and stops even when pages are still full", async () => {
        const fetcher = async (req: PaginatedRequest) => [req.page! * 10, req.page! * 10 + 1];
        const items = await collect(iterAll(fetcher, {}, { pageSize: 2, maxPages: 2 }));
        expect(items).toEqual([10, 11, 20, 21]);
    });

    it("honors startPage for resume flows", async () => {
        const fetcher = async (req: PaginatedRequest) => (req.page! < 5 ? [req.page!] : []);
        const items = await collect(iterAll(fetcher, {}, { pageSize: 1, startPage: 3 }));
        expect(items).toEqual([3, 4]);
    });

    it("propagates fetcher rejections", async () => {
        const fetcher = async (_req: PaginatedRequest) => {
            throw new Error("upstream-500");
        };
        await expect(collect(iterAll(fetcher, {}))).rejects.toThrow("upstream-500");
    });

    it("forwards baseRequest fields on every page", async () => {
        const observed: Array<{ workspaceId: string; page: number }> = [];
        type Req = PaginatedRequest & { workspaceId: string };
        const fetcher = async (req: Req) => {
            observed.push({ workspaceId: req.workspaceId, page: req.page! });
            return req.page === 1 ? [10, 20] : [];
        };
        await collect(iterAll(fetcher, { workspaceId: "ws-1" }, { pageSize: 2 }));
        expect(observed).toEqual([
            { workspaceId: "ws-1", page: 1 },
            { workspaceId: "ws-1", page: 2 },
        ]);
    });

    it("rejects invalid pageSize / maxPages / startPage", async () => {
        const fetcher = async () => [] as number[];
        await expect(collect(iterAll(fetcher, {}, { pageSize: 0 }))).rejects.toThrow(
            /pageSize must be a positive integer/,
        );
        await expect(collect(iterAll(fetcher, {}, { maxPages: 0 }))).rejects.toThrow(
            /maxPages must be a positive integer/,
        );
        await expect(collect(iterAll(fetcher, {}, { startPage: 0 }))).rejects.toThrow(
            /startPage must be a positive integer/,
        );
    });

    it("rejects NaN and non-integer pageSize / maxPages / startPage", async () => {
        const fetcher = async () => [] as number[];
        // NaN previously slipped through and yielded a SILENT empty walk (endPage NaN).
        await expect(collect(iterAll(fetcher, {}, { pageSize: NaN }))).rejects.toThrow(RangeError);
        await expect(collect(iterAll(fetcher, {}, { maxPages: NaN }))).rejects.toThrow(RangeError);
        await expect(collect(iterAll(fetcher, {}, { startPage: NaN }))).rejects.toThrow(RangeError);
        await expect(collect(iterAll(fetcher, {}, { pageSize: 2.5 }))).rejects.toThrow(
            /pageSize must be a positive integer/,
        );
        await expect(collect(iterAll(fetcher, {}, { maxPages: 2.5 }))).rejects.toThrow(
            /maxPages must be a positive integer/,
        );
        await expect(collect(iterAll(fetcher, {}, { startPage: 1.5 }))).rejects.toThrow(
            /startPage must be a positive integer/,
        );
    });

    it("rejects unsafe pagination integers before making a request", async () => {
        const fetcher = vi.fn(async () => [] as number[]);
        await expect(
            collect(iterAll(fetcher, {}, { maxPages: Number.MAX_SAFE_INTEGER + 1 })),
        ).rejects.toThrow(/maxPages.*Number\.MAX_SAFE_INTEGER/);
        await expect(
            collect(iterAll(fetcher, {}, { startPage: Number.MAX_SAFE_INTEGER + 1 })),
        ).rejects.toThrow(/startPage.*Number\.MAX_SAFE_INTEGER/);
        await expect(
            collect(iterAll(fetcher, {}, { startPage: Number.MAX_SAFE_INTEGER, maxPages: 2 })),
        ).rejects.toThrow(/final page.*Number\.MAX_SAFE_INTEGER/);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("rejects a pageSize above the documented API maximum of 200 (SDK-3)", async () => {
        // expense-list.ts already rejects pageSize > 200; iter.ts accepted any
        // positive integer and the server would silently clamp instead.
        const fetcher = async () => [] as number[];
        await expect(collect(iterAll(fetcher, {}, { pageSize: 201 }))).rejects.toThrow(
            /pageSize.*200/,
        );
        await expect(collect(iterAll(fetcher, {}, { pageSize: 200 }))).resolves.toEqual([]);
    });

    it(
        "throws instead of hanging when the server repeats the same non-empty page (SDK-2)",
        { timeout: 5000 },
        async () => {
            // The empty-page rule already stops a `Last-Page: false` server;
            // the only true infinite loop is a server that returns the SAME
            // non-empty page for ever. Detect it and fail loudly.
            const stuckPage = [
                { id: "a", name: "first" },
                { id: "b", name: "second" },
            ];
            const fetcher = async (_req: PaginatedRequest) => stuckPage;
            await expect(collect(iterAll(fetcher, {}, { pageSize: 2 }))).rejects.toThrow(
                /identical|same page|repeat/i,
            );
        },
    );

    it("does not misfire the repeated-page guard on distinct full pages", async () => {
        const dataset: Record<number, readonly { id: string }[]> = {
            1: [{ id: "a" }, { id: "b" }],
            2: [{ id: "c" }, { id: "d" }],
            3: [{ id: "e" }],
        };
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];
        const items = await collect(iterAll(fetcher, {}, { pageSize: 2 }));
        expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("treats stable ids as the page identity when other fields change", async () => {
        const pages: Record<number, readonly { id: string; revision: number }[]> = {
            1: [
                { id: "a", revision: 1 },
                { id: "b", revision: 1 },
            ],
            2: [
                { id: "a", revision: 2 },
                { id: "b", revision: 2 },
            ],
        };
        const fetcher = async (req: PaginatedRequest) => pages[req.page!] ?? [];

        await expect(collect(iterAll(fetcher, {}, { pageSize: 2, maxPages: 2 }))).rejects.toThrow(
            "page 1 and 2, 2 items",
        );
    });

    it("uses JSON identity when an item has an empty id", async () => {
        const pages: Record<number, readonly { id: string; revision: number }[]> = {
            1: [{ id: "", revision: 1 }],
            2: [{ id: "", revision: 2 }],
        };
        const fetcher = async (req: PaginatedRequest) => pages[req.page!] ?? [];

        const items = await collect(iterAll(fetcher, {}, { pageSize: 1, maxPages: 2 }));

        expect(items.map((item) => item.revision)).toEqual([1, 2]);
    });

    it("keeps adjacent ids distinct in the repeated-page fingerprint", async () => {
        const pages: Record<number, readonly { id: string }[]> = {
            1: [{ id: "ab" }, { id: "c" }],
            2: [{ id: "a" }, { id: "bc" }],
        };
        const fetcher = async (req: PaginatedRequest) => pages[req.page!] ?? [];

        const items = await collect(iterAll(fetcher, {}, { pageSize: 2, maxPages: 2 }));

        expect(items.map((item) => item.id)).toEqual(["ab", "c", "a", "bc"]);
    });

    it("does not block pagination when id-less items cannot be serialized", async () => {
        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;
        const fetcher = async () => [cyclic];

        const pages = await collect(iterPages(fetcher, {}, { pageSize: 1, maxPages: 2 }));

        expect(pages).toHaveLength(2);
        expect(pages[0]!.items[0]).toBe(cyclic);
        expect(pages[1]!.items[0]).toBe(cyclic);
    });

    it("accepts null items without dereferencing an id", async () => {
        const fetcher = async () => [null] as const;

        const pages = await collect(iterPages(fetcher, {}, { pageSize: 1, maxPages: 1 }));

        expect(pages).toEqual([{ items: [null], page: 1, pageSize: 1, hasNextPage: true }]);
    });

    it("does not fingerprint items after pagination has ended", async () => {
        const terminalItem = Object.defineProperty({}, "id", {
            get: () => {
                throw new Error("terminal id must not be read");
            },
        });
        const fetcher = async () => [terminalItem];

        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));

        expect(pages).toHaveLength(1);
        expect(pages[0]!.items[0]).toBe(terminalItem);
        expect(pages[0]!.hasNextPage).toBe(false);
    });

    it("accepts the final safe-integer page boundary", async () => {
        const fetcher = vi.fn(async () => [] as number[]);

        const pages = await collect(
            iterPages(
                fetcher,
                {},
                {
                    startPage: Number.MAX_SAFE_INTEGER - 1,
                    maxPages: 2,
                },
            ),
        );

        expect(pages).toEqual([
            {
                items: [],
                page: Number.MAX_SAFE_INTEGER - 1,
                pageSize: 50,
                hasNextPage: false,
            },
        ]);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("rejects an unsafe next page during an unbounded walk", async () => {
        const fetcher = vi.fn(async () => ["full"]);

        await expect(
            collect(
                iterPages(
                    fetcher,
                    {},
                    {
                        pageSize: 1,
                        startPage: Number.MAX_SAFE_INTEGER,
                        maxPages: Number.POSITIVE_INFINITY,
                    },
                ),
            ),
        ).rejects.toThrow("iterPages: the next page exceeds Number.MAX_SAFE_INTEGER");
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("an EXPLICIT maxPages: Infinity still walks (the unbounded sentinel is not rejected)", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3] };
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];
        const items = await collect(
            iterAll(fetcher, {}, { pageSize: 2, maxPages: Number.POSITIVE_INFINITY }),
        );
        expect(items).toEqual([1, 2, 3]);
    });
});

describe("iterPages", () => {
    it("yields page envelopes with hasNextPage true on full pages, false on partial", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3] };
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([
            { items: [1, 2], page: 1, pageSize: 2, hasNextPage: true },
            { items: [3], page: 2, pageSize: 2, hasNextPage: false },
        ]);
    });

    it("emits a single empty envelope when the first page is empty", async () => {
        const fetcher = async (_req: PaginatedRequest) => [] as number[];
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 5 }));
        expect(pages).toEqual([{ items: [], page: 1, pageSize: 5, hasNextPage: false }]);
    });
});

describe("iterPages — Last-Page header consumption", () => {
        // Build a thenable that mimics the generated HttpResponsePromise<T>:
    // resolves to the data on `await`, and exposes `.withRawResponse()`
    // returning the data + a `rawResponse` carrying the Last-Page
    // header. The wrapper feature-detects `withRawResponse` and uses
    // the header as the authoritative end-of-pages signal.
    function fakeHttpResponsePromise<T>(data: T, lastPageHeader: string | null) {
        const headersGet = (name: string): string | null =>
            name.toLowerCase() === "last-page" ? lastPageHeader : null;
        const promise = Promise.resolve(data);
        return Object.assign(promise, {
            withRawResponse: () =>
                Promise.resolve({
                    data,
                    rawResponse: { headers: { get: headersGet } },
                }),
        });
    }

    it("stops on Last-Page: true even when the page is exactly full", async () => {
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            return fakeHttpResponsePromise([1, 2], "true");
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([{ items: [1, 2], page: 1, pageSize: 2, hasNextPage: false }]);
        expect(seen).toEqual([1]);
    });

    it("continues past a full page when Last-Page: false, stops on next true", async () => {
        const data: Record<number, [readonly number[], string]> = {
            1: [[1, 2], "false"],
            2: [[3, 4], "true"],
        };
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            const [items, header] = data[req.page!]!;
            return fakeHttpResponsePromise(items, header);
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([
            { items: [1, 2], page: 1, pageSize: 2, hasNextPage: true },
            { items: [3, 4], page: 2, pageSize: 2, hasNextPage: false },
        ]);
        expect(seen).toEqual([1, 2]);
    });

    it("parses Last-Page case-insensitively (TRUE, True both stop)", async () => {
        const fetcher = (_req: PaginatedRequest) => fakeHttpResponsePromise([1, 2, 3], "TRUE");
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 3 }));
        expect(pages).toHaveLength(1);
        expect(pages[0]!.hasNextPage).toBe(false);
    });

    it("falls back to length heuristic when Last-Page is absent (legacy server)", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3] };
        const fetcher = (req: PaginatedRequest) =>
            fakeHttpResponsePromise(dataset[req.page!] ?? [], null);
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([
            { items: [1, 2], page: 1, pageSize: 2, hasNextPage: true },
            { items: [3], page: 2, pageSize: 2, hasNextPage: false },
        ]);
    });

    it("falls back to the length heuristic on a garbage (non-true/false) Last-Page value", async () => {
        // A non-null but unparseable header ("maybe") must be treated as ABSENT —
        // parseLastPageHeader returns undefined — so hasNextPage comes from the
        // items.length === pageSize heuristic, NOT from the header. This pins the
        // `normalized === "false"` arm in iter.ts: mutating its condition to a
        // constant would make a garbage header force hasNextPage:false even on a
        // FULL page.
        const fullPage = (_req: PaginatedRequest) => fakeHttpResponsePromise([1, 2], "maybe");
        const fullPages = await collect(iterPages(fullPage, {}, { pageSize: 2, maxPages: 1 }));
        // FULL page (length === pageSize) + garbage header -> heuristic says MORE.
        expect(fullPages).toEqual([{ items: [1, 2], page: 1, pageSize: 2, hasNextPage: true }]);

        const shortPage = (_req: PaginatedRequest) => fakeHttpResponsePromise([1], "maybe");
        const shortPages = await collect(iterPages(shortPage, {}, { pageSize: 2 }));
        // SHORT page (length < pageSize) + same garbage header -> heuristic says DONE.
        expect(shortPages).toEqual([{ items: [1], page: 1, pageSize: 2, hasNextPage: false }]);
    });

    it("continues on a short page when Last-Page: false (server is authoritative)", async () => {
        // The server said "more pages exist" even though this page came
        // back short (a legitimately filtered/partial page). Trusting the
        // header avoids silently under-fetching; the next page's
        // Last-Page: true terminates the walk.
        const data: Record<number, [readonly number[], string]> = {
            1: [[1], "false"],
            2: [[2], "true"],
        };
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            const [items, header] = data[req.page!]!;
            return fakeHttpResponsePromise(items, header);
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([
            { items: [1], page: 1, pageSize: 2, hasNextPage: true },
            { items: [2], page: 2, pageSize: 2, hasNextPage: false },
        ]);
        expect(seen).toEqual([1, 2]);
    });

    it("maxPages still bounds the walk when Last-Page: false never flips to true", async () => {
        // A buggy server that always claims more pages must not loop
        // forever — the maxPages / endPage bound caps it. Each page is
        // full + Last-Page: false, so without the bound this would run
        // unbounded.
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            // Distinct items per page: this test pins the maxPages bound on a
            // lying server; identical repeated pages are the SDK-2 guard's
            // territory and throw before the bound is reached.
            return fakeHttpResponsePromise([req.page! * 2 - 1, req.page! * 2], "false");
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2, maxPages: 3 }));
        expect(pages).toHaveLength(3);
        // Last page still reports hasNextPage:true (server lied), but the
        // generator stopped because the maxPages bound was reached.
        expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
        expect(pages[2]!.hasNextPage).toBe(true);
        expect(seen).toEqual([1, 2, 3]);
    });

    it("stops on an empty page even when Last-Page: false and no maxPages is set", async () => {
        // Regression guard for wrapper-pagination-1: the default maxPages is
        // unbounded (Number.POSITIVE_INFINITY), so a server stuck on
        // Last-Page: false must still terminate. An empty page (zero items)
        // ends the walk on the header-trust branch with NO maxPages passed.
        const seen: number[] = [];
        const fetcher = (req: PaginatedRequest) => {
            seen.push(req.page!);
            return fakeHttpResponsePromise([] as number[], "false");
        };
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([{ items: [], page: 1, pageSize: 2, hasNextPage: false }]);
        expect(seen).toEqual([1]);
    });

    it("ignores Last-Page when fetcher returns a plain Promise (no .withRawResponse)", async () => {
        // A test fetcher (or a non-Fern variant) that returns a bare
        // array without the .withRawResponse hook should still work via
        // the legacy heuristic.
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3] };
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];
        const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));
        expect(pages).toEqual([
            { items: [1, 2], page: 1, pageSize: 2, hasNextPage: true },
            { items: [3], page: 2, pageSize: 2, hasNextPage: false },
        ]);
    });
});

describe("IterOptions.onPage", () => {
    it("fires once per page with the page number and item count", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3, 4], 3: [5] };
        const calls: Array<{ page: number; count: number }> = [];
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];

        await collect(iterAll(fetcher, {}, { pageSize: 2, onPage: (info) => calls.push(info) }));

        expect(calls).toEqual([
            { page: 1, count: 2 },
            { page: 2, count: 2 },
            { page: 3, count: 1 },
        ]);
    });
});

// A bounded walk that stopped early and a complete walk both just stop.
// `iterAll` flattens the page envelope away, so without this callback a
// consumer that passes `maxPages` cannot tell a partial result from a
// whole one.
describe("IterOptions.onTruncated", () => {
    const fullPages = async (req: PaginatedRequest) => [req.page! * 10, req.page! * 10 + 1];

    it("fires with the last page walked when maxPages cuts a full walk short", async () => {
        const calls: Array<{ lastPage: number; pageSize: number }> = [];

        await collect(
            iterAll(fullPages, {}, { pageSize: 2, maxPages: 2, onTruncated: (i) => calls.push(i) }),
        );

        expect(calls).toEqual([{ lastPage: 2, pageSize: 2 }]);
    });

    it("reports the absolute last page, not the page count, when resuming", async () => {
        const calls: Array<{ lastPage: number; pageSize: number }> = [];

        await collect(
            iterPages(
                fullPages,
                {},
                { pageSize: 2, startPage: 4, maxPages: 2, onTruncated: (i) => calls.push(i) },
            ),
        );

        // startPage 4 + maxPages 2 walks pages 4 and 5; resume at 6.
        expect(calls).toEqual([{ lastPage: 5, pageSize: 2 }]);
    });

    it("stays silent when the walk reaches the true end inside maxPages", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3] };
        const calls: unknown[] = [];
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];

        await collect(
            iterAll(fetcher, {}, { pageSize: 2, maxPages: 9, onTruncated: (i) => calls.push(i) }),
        );

        expect(calls).toEqual([]);
    });

    it("stays silent when the last allowed page is also the server's last page", async () => {
        // Boundary: the walk consumes its whole budget but is NOT truncated,
        // because the final page came back short.
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3] };
        const calls: unknown[] = [];
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];

        await collect(
            iterAll(fetcher, {}, { pageSize: 2, maxPages: 2, onTruncated: (i) => calls.push(i) }),
        );

        expect(calls).toEqual([]);
    });

    it("stays silent on an unbounded walk", async () => {
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [] };
        const calls: unknown[] = [];
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];

        await collect(iterAll(fetcher, {}, { pageSize: 2, onTruncated: (i) => calls.push(i) }));

        expect(calls).toEqual([]);
    });

    it("over-reports on a header-less endpoint whose last page fills exactly", async () => {
        // Documented limitation, pinned so it cannot change silently. Without
        // `Last-Page`, `hasNextPage` is the `items.length === pageSize`
        // heuristic, so a complete dataset of exactly maxPages × pageSize
        // items looks truncated. False positives are possible here; false
        // negatives are not, and that is the safe direction.
        const dataset: Record<number, readonly number[]> = { 1: [1, 2], 2: [3, 4] };
        const calls: unknown[] = [];
        const fetcher = async (req: PaginatedRequest) => dataset[req.page!] ?? [];

        await collect(
            iterAll(fetcher, {}, { pageSize: 2, maxPages: 2, onTruncated: (i) => calls.push(i) }),
        );

        expect(calls).toEqual([{ lastPage: 2, pageSize: 2 }]);
    });

    it("does not fire when the consumer breaks out of the walk early", async () => {
        // Breaking returns the generator at its paused `yield`, so nothing
        // after the loop runs. The callback answers "did the page bound cut
        // this walk short", not "did you stop early" — the consumer that
        // broke already knows it did.
        const calls: unknown[] = [];

        for await (const _item of iterAll(
            fullPages,
            {},
            { pageSize: 2, maxPages: 5, onTruncated: (i) => calls.push(i) },
        )) {
            break;
        }

        expect(calls).toEqual([]);
    });

    it("does not fire when Last-Page: true ends the walk exactly at the bound", async () => {
        // The header is authoritative, so this is a complete walk that merely
        // happens to end on the last allowed page.
        const calls: unknown[] = [];
        const fetcher = (_req: PaginatedRequest) => {
            const data = [1, 2];
            const promise = Promise.resolve(data);
            return Object.assign(promise, {
                withRawResponse: () =>
                    Promise.resolve({
                        data,
                        rawResponse: { headers: { get: () => "true" } },
                    }),
            });
        };

        await collect(
            iterPages(fetcher, {}, { pageSize: 2, maxPages: 1, onTruncated: (i) => calls.push(i) }),
        );

        expect(calls).toEqual([]);
    });
});

describe("KNOWN_PAGINATED_METHODS", () => {
    // CI drift assertion: every (resource, method) in the documented
    // list must exist on a freshly-constructed ClockifyApiClient. If a
    // method is renamed or removed upstream in GOCLMCP, this fails at
    // type-check or runtime and the wrapper's list needs updating.
    const client = createClockifyClient({ apiKey: "drift-check" });

    for (const { resource, method } of KNOWN_PAGINATED_METHODS) {
        it(`${resource}.${method} exists on the client`, () => {
            const resourceClient = (client as unknown as Record<string, Record<string, unknown>>)[
                resource
            ];
            expect(resourceClient).toBeDefined();
            // After `toBeDefined`, narrow for `noUncheckedIndexedAccess`.
            expect(typeof resourceClient?.[method]).toBe("function");
        });
    }

    it("has exactly 14 entries", () => {
        expect(KNOWN_PAGINATED_METHODS.length).toBe(14);
    });

    it("excludes envelope-returning and unpaginated methods", () => {
        const names = new Set(KNOWN_PAGINATED_METHODS.map((m) => `${m.resource}.${m.method}`));
        expect(names.has("balances.getForUser")).toBe(false);
        expect(names.has("balances.listForPolicy")).toBe(false);
        expect(names.has("customFields.listForProject")).toBe(false);
        expect(names.has("customFields.listForWorkspace")).toBe(false);
        expect(names.has("holidays.list")).toBe(false);
    });
});
