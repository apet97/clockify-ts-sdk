import { describe, expect, it } from "vitest";
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
        await collect(iterAll<Req, number>(fetcher, { workspaceId: "ws-1" }, { pageSize: 2 }));
        expect(observed).toEqual([
            { workspaceId: "ws-1", page: 1 },
            { workspaceId: "ws-1", page: 2 },
        ]);
    });

    it("rejects invalid pageSize / maxPages / startPage", async () => {
        const fetcher = async () => [] as number[];
        await expect(collect(iterAll(fetcher, {}, { pageSize: 0 }))).rejects.toThrow(
            /pageSize must be > 0/,
        );
        await expect(collect(iterAll(fetcher, {}, { maxPages: 0 }))).rejects.toThrow(
            /maxPages must be > 0/,
        );
        await expect(collect(iterAll(fetcher, {}, { startPage: 0 }))).rejects.toThrow(
            /startPage must be > 0/,
        );
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
            expect(typeof resourceClient[method]).toBe("function");
        });
    }

    it("has exactly 19 entries", () => {
        expect(KNOWN_PAGINATED_METHODS.length).toBe(19);
    });
});
