import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { iterAll, iterPages, type PaginatedRequest } from "../iter.js";

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iterable) out.push(item);
    return out;
}

function response<T>(data: T, lastPage: string | null) {
    const promise = Promise.resolve(data);
    return Object.assign(promise, {
        withRawResponse: () =>
            Promise.resolve({
                data,
                rawResponse: {
                    headers: {
                        get: (name: string) => (name.toLowerCase() === "last-page" ? lastPage : null),
                    },
                },
            }),
    });
}

describe("iterPages properties", () => {
    it("flattens pages as concat and emits strictly increasing page envelopes", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 20 }),
                fc.integer({ min: 1, max: 8 }),
                fc.integer({ min: 0, max: 100 }),
                async (pageSize, pageCount, rawLastCount) => {
                    const lastCount = rawLastCount % pageSize;
                    const lengths = Array.from({ length: pageCount }, (_, index) =>
                        index === pageCount - 1 ? lastCount : pageSize,
                    );
                    let next = 0;
                    const pages = lengths.map((length) =>
                        Array.from({ length }, () => {
                            next += 1;
                            return next;
                        }),
                    );
                    const fetcher = async (req: PaginatedRequest) => pages[req.page! - 1] ?? [];

                    const envelopes = await collect(iterPages(fetcher, {}, { pageSize }));
                    const items = await collect(iterAll(fetcher, {}, { pageSize }));

                    expect(items).toEqual(pages.flat());
                    expect(envelopes.map((page) => page.page)).toEqual(
                        Array.from({ length: pageCount }, (_, index) => index + 1),
                    );
                    expect(envelopes.every((page) => page.pageSize === pageSize)).toBe(true);
                },
            ),
        );
    });

    it("Last-Page false overrides a short page", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 2, max: 20 }),
                fc.integer({ min: 0, max: 18 }),
                async (pageSize, rawShortCount) => {
                    const shortCount = rawShortCount % pageSize;
                    const seen: number[] = [];
                    const fetcher = (req: PaginatedRequest) => {
                        seen.push(req.page!);
                        if (req.page === 1) {
                            return response(Array.from({ length: shortCount }, (_, index) => index), "false");
                        }
                        return response([pageSize], "true");
                    };

                    const pages = await collect(iterPages(fetcher, {}, { pageSize }));

                    expect(seen).toEqual([1, 2]);
                    expect(pages).toHaveLength(2);
                    expect(pages[0]!.hasNextPage).toBe(true);
                    expect(pages[1]!.hasNextPage).toBe(false);
                },
            ),
        );
    });

    it("Last-Page true overrides a full page", async () => {
        await fc.assert(
            fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (pageSize) => {
                const seen: number[] = [];
                const fetcher = (req: PaginatedRequest) => {
                    seen.push(req.page!);
                    return response(Array.from({ length: pageSize }, (_, index) => index), "true");
                };

                const pages = await collect(iterPages(fetcher, {}, { pageSize }));

                expect(seen).toEqual([1]);
                expect(pages).toHaveLength(1);
                expect(pages[0]!.hasNextPage).toBe(false);
            }),
        );
    });

    it("Last-Page parsing is case and whitespace insensitive", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom("true", "TRUE", " True ", "false", "FALSE", " False "),
                async (header) => {
                    const normalized = header.trim().toLowerCase();
                    const seen: number[] = [];
                    const fetcher = (req: PaginatedRequest) => {
                        seen.push(req.page!);
                        return response([req.page], req.page === 1 ? header : "true");
                    };

                    const pages = await collect(iterPages(fetcher, {}, { pageSize: 2 }));

                    expect(pages[0]!.hasNextPage).toBe(normalized === "false");
                    expect(seen).toEqual(normalized === "false" ? [1, 2] : [1]);
                },
            ),
        );
    });

    it("startPage and maxPages bound a full-page walk", async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 20 }),
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 1, max: 20 }),
                async (startPage, maxPages, pageSize) => {
                    const fetcher = async (req: PaginatedRequest) =>
                        Array.from({ length: pageSize }, () => req.page!);

                    const pages = await collect(
                        iterPages(fetcher, {}, { startPage, maxPages, pageSize }),
                    );

                    expect(pages).toHaveLength(maxPages);
                    expect(pages[0]!.page).toBe(startPage);
                    expect(pages.map((page) => page.page)).toEqual(
                        Array.from({ length: maxPages }, (_, index) => startPage + index),
                    );
                },
            ),
        );
    });

    it("throws RangeError for non-positive pagination options", async () => {
        await fc.assert(
            fc.asyncProperty(fc.integer({ min: -20, max: 0 }), async (value) => {
                const fetcher = async () => [] as number[];
                await expect(collect(iterPages(fetcher, {}, { pageSize: value }))).rejects.toThrow(
                    RangeError,
                );
                await expect(collect(iterPages(fetcher, {}, { maxPages: value }))).rejects.toThrow(
                    RangeError,
                );
                await expect(collect(iterPages(fetcher, {}, { startPage: value }))).rejects.toThrow(
                    RangeError,
                );
            }),
        );
    });
});
