import { describe, expect, it } from "vitest";

import { bulkArchiveProjects, bulkDelete, mapBounded } from "../bulk.js";

describe("mapBounded", () => {
    it("collects every success when all items succeed (continueOnError default)", async () => {
        const { ok, failures } = await mapBounded([1, 2, 3, 4], async (n) => n * 2);
        expect([...ok].sort((a, b) => a - b)).toEqual([2, 4, 6, 8]);
        expect(failures).toEqual([]);
    });

    it("partitions failures with item + index and keeps going", async () => {
        const { ok, failures } = await mapBounded([1, 2, 3], async (n) => {
            if (n === 2) throw new Error("boom");
            return n;
        });
        expect([...ok].sort((a, b) => a - b)).toEqual([1, 3]);
        expect(failures).toHaveLength(1);
        expect(failures[0]!.item).toBe(2);
        expect(failures[0]!.index).toBe(1);
        expect((failures[0]!.error as Error).message).toBe("boom");
    });

    it("rejects on the first failure when continueOnError is false", async () => {
        await expect(
            mapBounded(
                [1, 2, 3],
                async (n) => {
                    if (n === 2) throw new Error("stop");
                    return n;
                },
                { continueOnError: false },
            ),
        ).rejects.toThrow("stop");
    });

    it("never exceeds the concurrency bound", async () => {
        let inFlight = 0;
        let peak = 0;
        await mapBounded(
            [1, 2, 3, 4, 5, 6, 7, 8],
            async (n) => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                await new Promise((resolve) => setTimeout(resolve, 5));
                inFlight -= 1;
                return n;
            },
            { concurrency: 2 },
        );
        expect(peak).toBeLessThanOrEqual(2);
    });
});

describe("bulkArchiveProjects / bulkDelete", () => {
    it("runs the injected operation over each id", async () => {
        const archived: string[] = [];
        const res = await bulkArchiveProjects(["p1", "p2"], async (id) => {
            archived.push(id);
            return id;
        });
        expect([...archived].sort()).toEqual(["p1", "p2"]);
        expect([...res.ok].sort()).toEqual(["p1", "p2"]);

        const deleted: string[] = [];
        await bulkDelete(["t1"], async (id) => {
            deleted.push(id);
        });
        expect(deleted).toEqual(["t1"]);
    });
});
