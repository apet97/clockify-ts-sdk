import { describe, expect, it } from "vitest";

import { listExpensesFiltered, type ExpenseListFetcher } from "../expense-list.js";

type Expense = { id: string; date?: string };

function page(items: Expense[], lastPage?: boolean): ReturnType<ExpenseListFetcher<Expense>> {
    const data = { expenses: { expenses: items, count: items.length } };
    const result = Promise.resolve(data) as ReturnType<ExpenseListFetcher<Expense>>;
    if (lastPage !== undefined) {
        result.withRawResponse = async () => ({
            data,
            rawResponse: new Response(null, {
                headers: { "Last-Page": String(lastPage) },
            }),
        });
    }
    return result;
}

describe("listExpensesFiltered", () => {
    it("filters matching expenses across three pages", async () => {
        const calls: number[] = [];
        const fetcher: ExpenseListFetcher<Expense> = (request) => {
            calls.push(request.page ?? 0);
            const pages: Record<number, Expense[]> = {
                1: [
                    { id: "before", date: "2026-05-31" },
                    { id: "first", date: "2026-06-01" },
                ],
                2: [
                    { id: "middle", date: "2026-06-15T12:00:00Z" },
                    { id: "after", date: "2026-07-01" },
                ],
                3: [{ id: "last", date: "2026-06-30T23:59:59Z" }],
            };
            return page(pages[request.page ?? 0] ?? [], request.page === 3);
        };

        const result = await listExpensesFiltered(
            fetcher,
            { workspaceId: "ws-1" },
            {
                start: "2026-06-01",
                end: "2026-06-30",
                pageSize: 2,
                limit: 10,
                maxPages: 5,
            },
        );

        expect(calls).toEqual([1, 2, 3]);
        expect(result.items.map((item) => item.id)).toEqual(["first", "middle", "last"]);
        expect(result.meta).toMatchObject({ pagesFetched: 3, lastPage: 3, hasMore: false });
    });

    it("continues after an empty intermediate page when Last-Page is false", async () => {
        const calls: number[] = [];
        const fetcher: ExpenseListFetcher<Expense> = (request) => {
            const current = request.page ?? 0;
            calls.push(current);
            if (current === 1) return page([{ id: "one", date: "2026-06-01" }], false);
            if (current === 2) return page([], false);
            return page([{ id: "three", date: "2026-06-03" }], true);
        };

        const result = await listExpensesFiltered(
            fetcher,
            { workspaceId: "ws-1" },
            {
                pageSize: 1,
                limit: 10,
                maxPages: 3,
            },
        );

        expect(calls).toEqual([1, 2, 3]);
        expect(result.items.map((item) => item.id)).toEqual(["one", "three"]);
    });

    it("uses inclusive date-only and ISO instant bounds", async () => {
        const rows = [
            { id: "date-start", date: "2026-06-01" },
            { id: "iso-start", date: "2026-06-01T12:00:00+02:00" },
            { id: "iso-end", date: "2026-06-30T23:59:59Z" },
            { id: "date-end", date: "2026-06-30" },
            { id: "too-late", date: "2026-07-01T00:00:00Z" },
            { id: "missing" },
        ];

        const dateOnly = await listExpensesFiltered(
            () => page(rows, true),
            { workspaceId: "ws-1" },
            { start: "2026-06-01", end: "2026-06-30", limit: 20, maxPages: 2 },
        );
        const iso = await listExpensesFiltered(
            () => page(rows, true),
            { workspaceId: "ws-1" },
            {
                start: "2026-06-01T10:00:00Z",
                end: "2026-06-30T23:59:59Z",
                limit: 20,
                maxPages: 2,
            },
        );

        expect(dateOnly.items.map((item) => item.id)).toEqual([
            "date-start",
            "iso-start",
            "iso-end",
            "date-end",
        ]);
        expect(iso.items.map((item) => item.id)).toEqual(["iso-start", "iso-end", "date-end"]);
    });

    it("stops when Last-Page is true even if the page is full", async () => {
        const calls: number[] = [];
        const result = await listExpensesFiltered(
            (request) => {
                calls.push(request.page ?? 0);
                return page(
                    [
                        { id: "one", date: "2026-06-01" },
                        { id: "two", date: "2026-06-02" },
                    ],
                    true,
                );
            },
            { workspaceId: "ws-1" },
            { pageSize: 2, limit: 10, maxPages: 5 },
        );

        expect(calls).toEqual([1]);
        expect(result.meta).toMatchObject({ hasMore: false, pagesFetched: 1 });
        expect(result.meta.nextPage).toBeUndefined();
    });

    it("uses a bounded fallback and reports the next page when Last-Page is absent", async () => {
        const calls: number[] = [];
        const result = await listExpensesFiltered(
            (request) => {
                const current = request.page ?? 0;
                calls.push(current);
                return page([
                    { id: `${current}-a`, date: "2026-06-01" },
                    { id: `${current}-b`, date: "2026-06-02" },
                ]);
            },
            { workspaceId: "ws-1" },
            { pageSize: 2, limit: 20, maxPages: 3 },
        );

        expect(calls).toEqual([1, 2, 3]);
        expect(result.meta).toMatchObject({
            pagesFetched: 3,
            lastPage: 3,
            hasMore: true,
            nextPage: 4,
        });
    });

    it("treats total limit separately from page size", async () => {
        const requests: Array<{ page?: number; "page-size"?: number }> = [];
        const result = await listExpensesFiltered(
            (request) => {
                requests.push(request);
                const current = request.page ?? 0;
                return page(
                    [
                        { id: `${current}-a`, date: "2026-06-01" },
                        { id: `${current}-b`, date: "2026-06-02" },
                    ],
                    false,
                );
            },
            { workspaceId: "ws-1" },
            { pageSize: 2, limit: 3, maxPages: 5 },
        );

        expect(requests).toEqual([
            expect.objectContaining({ page: 1, "page-size": 2 }),
            expect.objectContaining({ page: 2, "page-size": 2 }),
        ]);
        expect(result.items).toHaveLength(3);
        expect(result.meta).toMatchObject({ hasMore: true, nextPage: 3, pageSize: 2, limit: 3 });
    });

    it("rejects invalid or unsafe page bounds before fetching", async () => {
        let calls = 0;
        const fetcher: ExpenseListFetcher<Expense> = () => {
            calls += 1;
            return page([], true);
        };
        const base = { workspaceId: "ws-1" };

        await expect(listExpensesFiltered(fetcher, base, { page: 0 })).rejects.toThrow(RangeError);
        await expect(listExpensesFiltered(fetcher, base, { pageSize: 201 })).rejects.toThrow(
            RangeError,
        );
        await expect(listExpensesFiltered(fetcher, base, { limit: 0 })).rejects.toThrow(RangeError);
        await expect(listExpensesFiltered(fetcher, base, { maxPages: 0 })).rejects.toThrow(
            RangeError,
        );
        await expect(
            listExpensesFiltered(fetcher, base, {
                page: Number.MAX_SAFE_INTEGER,
                maxPages: 2,
            }),
        ).rejects.toThrow(RangeError);
        await expect(listExpensesFiltered(fetcher, base, { start: "not-a-date" })).rejects.toThrow(
            RangeError,
        );
        await expect(
            listExpensesFiltered(fetcher, base, { start: "2026-07-01", end: "2026-06-01" }),
        ).rejects.toThrow(RangeError);
        expect(calls).toBe(0);
    });
});
