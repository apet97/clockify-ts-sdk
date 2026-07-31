import { describe, expect, it } from "vitest";

import { mapBounded } from "../bulk.js";

describe("mapBounded", () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid concurrency %s",
        async (concurrency) => {
            await expect(mapBounded([1], async (n) => n, { concurrency })).rejects.toThrow(
                /concurrency.*positive finite integer/i,
            );
        },
    );
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

    it("rejects even when the failure reason is undefined (continueOnError false)", async () => {
        // A rejection whose reason is `undefined` must still fail the call —
        // the pre-fix `firstError !== undefined` gate swallowed it and
        // resolved with a success-looking partial result.
        await expect(
            mapBounded(
                [1, 2, 3],
                async (x) => {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the nullish rejection reason IS the case under test
                    if (x === 2) throw undefined;
                    return x * 10;
                },
                { continueOnError: false, concurrency: 1 },
            ),
        ).rejects.toThrow("Bulk operation rejected");
    });

    it("preserves a non-Error rejection reason as the thrown error's cause", async () => {
        const reason = { code: "clockify_upstream", detail: "the real reason" };
        await expect(
            mapBounded(
                [1, 2, 3],
                async (x) => {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the non-Error rejection reason IS the case under test
                    if (x === 2) throw reason;
                    return x;
                },
                { continueOnError: false, concurrency: 1 },
            ),
        ).rejects.toMatchObject({ message: "Bulk operation rejected", cause: reason });
    });

    it("stops dispatching new work across sibling workers once a sibling fails (fail-fast)", async () => {
        // concurrency 4: items 0..39. Item 0 rejects immediately while items
        // 1..3 are mid-flight (already dispatched — they cannot be recalled).
        // The abort flag must keep EVERY worker from pulling items 4..39 off
        // the queue. The assertion has to wait for the pool to fully DRAIN:
        // asserting at the moment of rejection sees `started===4` with OR
        // without the guard (the siblings are still suspended on setTimeout),
        // so it would pass even for a broken implementation. After the pool
        // drains, an unguarded run has marched through all 40 items while the
        // guarded run is pinned at the initial in-flight pool.
        const items = Array.from({ length: 40 }, (_, i) => i);
        let started = 0;
        await expect(
            mapBounded(
                items,
                async (n) => {
                    started += 1;
                    if (n === 0) throw new Error("first");
                    await new Promise((resolve) => setTimeout(resolve, 1));
                    return n;
                },
                { continueOnError: false, concurrency: 4 },
            ),
        ).rejects.toThrow("first");
        // Drain: spin until `started` stops climbing (adaptive, so it is not
        // sensitive to scheduler jitter) or a generous cap. The guarded run
        // settles at the in-flight pool within a tick; an unguarded run keeps
        // dispatching until the whole queue is consumed.
        let prev = -1;
        for (let i = 0; i < 200 && started !== prev; i += 1) {
            prev = started;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        // Only the initial in-flight pool ever reached `fn`. Remove the
        // `if (failed) return;` guard from bulk.ts and this reaches 40.
        expect(started).toBeLessThanOrEqual(4);
        expect(started).toBeLessThan(items.length);
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
