import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
    canonicalJson,
    ConfirmationTokenStore,
    hashCanonical,
} from "../src/orchestration/confirmation.js";

function makeClock(start = 1_000_000) {
    const clock = { t: start };
    return { now: () => clock.t, clock };
}

const scope = {
    toolName: "clockify_projects_delete",
    workspaceId: "000000000000000000000900",
    risk: "destructive" as const,
    businessArgs: { projectId: "p-1" },
};
const preview = { action: "delete", projectId: "p-1" };

describe("ConfirmationTokenStore TTL / expiry", () => {
    it("accepts a token validated before the TTL elapses", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = await store.issue(scope, preview);

        clock.t += 999;

        await expect(store.consume(issued.confirmToken, scope)).resolves.toEqual(preview);
    });

    it("rejects a token once now reaches the expiry boundary", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = await store.issue(scope, preview);

        clock.t += 1000;

        await expect(store.consume(issued.confirmToken, scope)).rejects.toThrow(/expired/i);
    });

    it("rejects a token well past the TTL", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = await store.issue(scope, preview);

        clock.t += 10_000;

        await expect(store.consume(issued.confirmToken, scope)).rejects.toThrow(
            /expired|was not issued/i,
        );
    });

    it("substitutes the 5-minute default when ttlMs is negative", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: -5, now });
        const issued = await store.issue(scope, preview);

        // With ttlMs honored verbatim the token would already be expired; the
        // guard falls back to the 5-minute default, so 1ms later it still validates.
        clock.t += 1;

        await expect(store.consume(issued.confirmToken, scope)).resolves.toEqual(preview);
    });

    it("uses an exact five-minute expiry when configured TTL is invalid", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: Number.NaN, now });

        const issued = await store.issue(scope, preview);

        expect(issued.expiresAt).toBe(new Date(clock.t + 5 * 60 * 1000).toISOString());
    });

    it("substitutes the 5-minute default when ttlMs is zero", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 0, now });
        const issued = await store.issue(scope, preview);

        clock.t += 1;

        await expect(store.consume(issued.confirmToken, scope)).resolves.toEqual(preview);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY])(
        "substitutes the 5-minute default when ttlMs is non-finite (%s)",
        async (ttlMs) => {
            const { now, clock } = makeClock();
            const store = new ConfirmationTokenStore({ ttlMs, now });
            const issued = await store.issue(scope, preview);

            clock.t += 1;

            await expect(store.consume(issued.confirmToken, scope)).resolves.toEqual(preview);
        },
    );

    it("prunes expired tokens before issuing a fresh token", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const first = await store.issue(scope, preview);

        clock.t += 5000;

        const second = await store.issue(scope, preview);
        expect(second.confirmToken).not.toBe(first.confirmToken);
        await expect(store.consume(first.confirmToken, scope)).rejects.toThrow();
        await expect(store.consume(second.confirmToken, scope)).resolves.toEqual(preview);
    });
});

describe("ConfirmationTokenStore capacity", () => {
    it("accepts a preview that exactly fills the byte limit", async () => {
        const store = new ConfirmationTokenStore({ maxTotalBytes: 4 });

        const issued = await store.issue(scope, null);

        await expect(store.consume(issued.confirmToken, scope)).resolves.toBeNull();
    });

    it("rejects a new token when the entry limit is reached", async () => {
        const store = new ConfirmationTokenStore({ maxEntries: 2 });
        const first = await store.issue(scope, { value: "first" });
        const second = await store.issue(scope, { value: "second" });

        await expect(store.issue(scope, { value: "third" })).rejects.toThrow(
            /capacity|storage limit/i,
        );
        await expect(store.consume(first.confirmToken, scope)).resolves.toEqual({ value: "first" });
        await expect(store.consume(second.confirmToken, scope)).resolves.toEqual({
            value: "second",
        });
        const third = await store.issue(scope, { value: "third" });
        await expect(store.consume(third.confirmToken, scope)).resolves.toEqual({ value: "third" });
    });

    it("preserves existing tokens when a new preview exceeds the remaining byte limit", async () => {
        const store = new ConfirmationTokenStore({ maxEntries: 10, maxTotalBytes: 80 });
        const first = await store.issue(scope, { value: "a".repeat(40) });

        await expect(store.issue(scope, { value: "b".repeat(40) })).rejects.toThrow(
            /capacity|storage limit/i,
        );
        await expect(store.consume(first.confirmToken, scope)).resolves.toEqual({
            value: "a".repeat(40),
        });
        const second = await store.issue(scope, { value: "b".repeat(40) });
        await expect(store.consume(second.confirmToken, scope)).resolves.toEqual({
            value: "b".repeat(40),
        });
    });

    it("rejects one preview that exceeds the total byte limit", async () => {
        const store = new ConfirmationTokenStore({ maxTotalBytes: 16 });
        await expect(store.issue(scope, { value: "too-large" })).rejects.toThrow(/storage limit/i);
    });

    it("prunes a token at the exact expiry boundary before checking capacity", async () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, maxEntries: 1, now });
        const expired = await store.issue(scope, preview);

        clock.t += 1000;

        const replacement = await store.issue(scope, preview);
        await expect(store.consume(expired.confirmToken, scope)).rejects.toThrow(
            /not issued|expired/i,
        );
        await expect(store.consume(replacement.confirmToken, scope)).resolves.toEqual(preview);
    });
});

describe("ConfirmationTokenStore canonical-hash invariance", () => {
    it("consumes an array preview with its exact canonical contents", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const arrayPreview = [
            { id: "p-1", action: "delete" },
            { id: "p-2", action: "archive" },
        ];

        const issued = await store.issue(scope, arrayPreview);
        const consumed = await store.consume(issued.confirmToken, scope);

        expect(consumed).toEqual(arrayPreview);
        expect(Array.isArray(consumed)).toBe(true);
    });

    it("stores a canonical preview clone and returns it after scoped consumption", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const scope = {
            toolName: "clockify_projects_delete",
            workspaceId: "000000000000000000000900",
            risk: "destructive" as const,
            businessArgs: { projectId: "p-1", nested: { b: 2, a: 1 } },
        };
        const source = { z: 2, a: { value: "original" }, omitted: undefined };
        const issued = await store.issue(scope, source);
        source.a.value = "mutated";

        const consumed = await store.consume(issued.confirmToken, {
            ...scope,
            businessArgs: { nested: { a: 1, b: 2 }, projectId: "p-1" },
        });

        expect(consumed).toEqual({ a: { value: "original" }, z: 2 });
        expect(issued.previewHash).toBe(hashCanonical({ a: { value: "original" }, z: 2 }));
    });

    it("binds a preview token to tool, workspace, risk, and arguments", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const scope = {
            toolName: "clockify_projects_delete",
            workspaceId: "000000000000000000000900",
            risk: "destructive" as const,
            businessArgs: { projectId: "p-1" },
        };

        for (const changed of [
            { ...scope, toolName: "clockify_tasks_delete" },
            { ...scope, workspaceId: "000000000000000000000901" },
            { ...scope, risk: "business_write" as const },
            { ...scope, businessArgs: { projectId: "p-2" } },
        ]) {
            const issued = await store.issue(scope, { id: "p-1" });
            await expect(store.consume(issued.confirmToken, changed)).rejects.toThrow(
                /does not match/i,
            );
            await expect(store.consume(issued.confirmToken, scope)).rejects.toThrow(
                /already used|not issued/i,
            );
        }
    });

    it("validates when equivalent args arrive with keys in a different order", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const argsAtIssue = { b: 2, a: 1, nested: { y: 2, x: 1 } };
        const argsAtConfirm = { nested: { x: 1, y: 2 }, a: 1, b: 2 };

        const issued = await store.issue(
            {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: argsAtIssue,
            },
            { preview: true },
        );

        await expect(
            store.consume(issued.confirmToken, {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: argsAtConfirm,
            }),
        ).resolves.toEqual({ preview: true });
    });

    it("rejects when args actually differ", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const issued = await store.issue(
            {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: { a: 1 },
            },
            { p: 1 },
        );

        await expect(
            store.consume(issued.confirmToken, {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: { a: 2 },
            }),
        ).rejects.toThrow(/does not match/i);
    });

    it("rejects a bogus token outright", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        await store.issue(scope, preview);

        await expect(store.consume("not-a-real-token", scope)).rejects.toThrow(
            /was not issued|expired|already used/i,
        );
    });

    it("is one-use even with identical args", async () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const issued = await store.issue(scope, preview);

        await expect(store.consume(issued.confirmToken, scope)).resolves.toEqual(preview);
        await expect(store.consume(issued.confirmToken, scope)).rejects.toThrow();
    });
});

describe("hashCanonical order independence", () => {
    it("preserves own top-level and nested __proto__ keys in canonical JSON", () => {
        const value = JSON.parse(
            '{"z":1,"__proto__":{"polluted":"top"},"nested":{"__proto__":{"polluted":"nested"}}}',
        ) as Record<string, unknown>;

        expect(canonicalJson(value)).toBe(
            '{"__proto__":{"polluted":"top"},"nested":{"__proto__":{"polluted":"nested"}},"z":1}',
        );
        expect(({} as { polluted?: string }).polluted).toBeUndefined();
    });

    it("does not hash-collide previews that differ only in an own __proto__ value", () => {
        const first = JSON.parse('{"__proto__":{"value":"first"}}') as unknown;
        const second = JSON.parse('{"__proto__":{"value":"second"}}') as unknown;

        expect(hashCanonical(first)).not.toBe(hashCanonical(second));
    });

    it("round-trips own __proto__ keys through the stored canonical preview", async () => {
        const store = new ConfirmationTokenStore();
        const source = JSON.parse(
            '{"__proto__":{"top":true},"nested":{"__proto__":{"inner":true}}}',
        ) as unknown;
        const issued = await store.issue(scope, source);

        const consumed = (await store.consume(issued.confirmToken, scope)) as Record<
            string,
            unknown
        >;

        expect(Object.prototype.hasOwnProperty.call(consumed, "__proto__")).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(consumed.nested, "__proto__")).toBe(true);
        expect(consumed).toEqual(source);
        expect(({} as { top?: boolean; inner?: boolean }).top).toBeUndefined();
    });

    it("produces the same digest for deeply reordered keys", () => {
        const a = hashCanonical({ z: 1, a: { d: 4, c: 3 }, m: [{ q: 1, p: 2 }] });
        const b = hashCanonical({ a: { c: 3, d: 4 }, m: [{ p: 2, q: 1 }], z: 1 });

        expect(a).toBe(b);
    });

    it("changes the digest when a value changes", () => {
        expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 2 }));
    });

    it("does not conflate array order", () => {
        expect(hashCanonical([1, 2, 3])).not.toBe(hashCanonical([3, 2, 1]));
    });

    it("is independent of generated object key insertion order", () => {
        const jsonLeaf = fc.oneof(
            fc.integer(),
            fc.string({ maxLength: 12 }),
            fc.boolean(),
            fc.constant(null),
        );

        fc.assert(
            fc.property(
                fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), jsonLeaf, {
                    maxKeys: 12,
                }),
                (record) => {
                    const reversed = Object.fromEntries(Object.entries(record).reverse());
                    expect(hashCanonical(record)).toBe(hashCanonical(reversed));
                },
            ),
        );
    });
});
