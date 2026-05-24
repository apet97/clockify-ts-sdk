import { describe, it, expect } from "vitest";
import { paginate } from "../pagination.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("paginate", () => {
  it("yields items from a single page and stops on a partial page", async () => {
    const pages: number[] = [];
    const fetchPage = async (page: number, pageSize: number) => {
      pages.push(page);
      expect(pageSize).toBe(50);
      if (page === 1) return [1, 2, 3];
      return [];
    };
    const items = await collect(paginate(fetchPage));
    expect(items).toEqual([1, 2, 3]);
    expect(pages).toEqual([1]);
  });

  it("walks multiple pages and stops on the first non-full page", async () => {
    const pageSize = 2;
    const dataset = [[1, 2], [3, 4], [5]];
    const seen: number[] = [];
    const fetchPage = async (page: number, sz: number) => {
      expect(sz).toBe(pageSize);
      seen.push(page);
      return dataset[page - 1] ?? [];
    };
    const items = await collect(paginate(fetchPage, { pageSize }));
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("walks until an empty page when all pages are full-sized", async () => {
    const pageSize = 2;
    const dataset = [[1, 2], [3, 4], []];
    const seen: number[] = [];
    const fetchPage = async (page: number, sz: number) => {
      expect(sz).toBe(pageSize);
      seen.push(page);
      return dataset[page - 1] ?? [];
    };
    const items = await collect(paginate(fetchPage, { pageSize }));
    expect(items).toEqual([1, 2, 3, 4]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("respects maxPages and stops even if pages are still full", async () => {
    const seen: number[] = [];
    const fetchPage = async (page: number, _sz: number) => {
      seen.push(page);
      return [page * 10, page * 10 + 1];
    };
    const items = await collect(
      paginate(fetchPage, { pageSize: 2, maxPages: 2 }),
    );
    expect(items).toEqual([10, 11, 20, 21]);
    expect(seen).toEqual([1, 2]);
  });

  it("yields nothing when the first page is empty", async () => {
    let calls = 0;
    const fetchPage = async (_page: number, _sz: number) => {
      calls++;
      return [] as number[];
    };
    const items = await collect(paginate(fetchPage));
    expect(items).toEqual([]);
    expect(calls).toBe(1);
  });

  it("starts at page 1 by default", async () => {
    const seen: number[] = [];
    const fetchPage = async (page: number, _sz: number) => {
      seen.push(page);
      return [] as number[];
    };
    await collect(paginate(fetchPage));
    expect(seen[0]).toBe(1);
  });

  it("honors a custom startPage", async () => {
    const seen: number[] = [];
    const fetchPage = async (page: number, _sz: number) => {
      seen.push(page);
      return page < 5 ? [page] : [];
    };
    const items = await collect(
      paginate(fetchPage, { pageSize: 1, startPage: 3 }),
    );
    expect(seen).toEqual([3, 4, 5]);
    expect(items).toEqual([3, 4]);
  });

  it("propagates fetchPage rejections", async () => {
    const fetchPage = async (_page: number, _sz: number) => {
      throw new Error("upstream-403");
    };
    await expect(collect(paginate(fetchPage))).rejects.toThrow("upstream-403");
  });
});
