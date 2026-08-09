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
    it("accepts a token validated before the TTL elapses", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = store.issue(scope, preview);

        clock.t += 999;

        expect(() => store.consume(issued.confirmToken, scope)).not.toThrow();
    });

    it("rejects a token once now reaches the expiry boundary", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = store.issue(scope, preview);

        clock.t += 1000;

        expect(() => store.consume(issued.confirmToken, scope)).toThrow(/expired/i);
    });

    it("rejects a token well past the TTL", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = store.issue(scope, preview);

        clock.t += 10_000;

        expect(() => store.consume(issued.confirmToken, scope)).toThrow(/expired|was not issued/i);
    });

    it("substitutes the 5-minute default when ttlMs is negative", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: -5, now });
        const issued = store.issue(scope, preview);

        // With ttlMs honored verbatim the token would already be expired; the
        // guard falls back to the 5-minute default, so 1ms later it still validates.
        clock.t += 1;

        expect(() => store.consume(issued.confirmToken, scope)).not.toThrow();
    });

    it("uses an exact five-minute expiry when configured TTL is invalid", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: Number.NaN, now });

        const issued = store.issue(scope, preview);

        expect(issued.expiresAt).toBe(new Date(clock.t + 5 * 60 * 1000).toISOString());
    });

    it("substitutes the 5-minute default when ttlMs is zero", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 0, now });
        const issued = store.issue(scope, preview);

        clock.t += 1;

        expect(() => store.consume(issued.confirmToken, scope)).not.toThrow();
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY])(
        "substitutes the 5-minute default when ttlMs is non-finite (%s)",
        (ttlMs) => {
            const { now, clock } = makeClock();
            const store = new ConfirmationTokenStore({ ttlMs, now });
            const issued = store.issue(scope, preview);

            clock.t += 1;

            expect(() => store.consume(issued.confirmToken, scope)).not.toThrow();
        },
    );

    it("prunes expired tokens before issuing a fresh token", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const first = store.issue(scope, preview);

        clock.t += 5000;

        const second = store.issue(scope, preview);
        expect(second.confirmToken).not.toBe(first.confirmToken);
        expect(() => store.consume(first.confirmToken, scope)).toThrow();
        expect(() => store.consume(second.confirmToken, scope)).not.toThrow();
    });
});

describe("ConfirmationTokenStore capacity", () => {
    it("accepts a preview that exactly fills the byte limit", () => {
        const store = new ConfirmationTokenStore({ maxTotalBytes: 4 });

        const issued = store.issue(scope, null);

        expect(store.consume(issued.confirmToken, scope)).toBeNull();
    });

    it("rejects a new token when the entry limit is reached", () => {
        const store = new ConfirmationTokenStore({ maxEntries: 2 });
        const first = store.issue(scope, { value: "first" });
        const second = store.issue(scope, { value: "second" });

        expect(() => store.issue(scope, { value: "third" })).toThrow(/capacity|storage limit/i);
        expect(store.consume(first.confirmToken, scope)).toEqual({ value: "first" });
        expect(store.consume(second.confirmToken, scope)).toEqual({ value: "second" });
        const third = store.issue(scope, { value: "third" });
        expect(store.consume(third.confirmToken, scope)).toEqual({ value: "third" });
    });

    it("preserves existing tokens when a new preview exceeds the remaining byte limit", () => {
        const store = new ConfirmationTokenStore({ maxEntries: 10, maxTotalBytes: 80 });
        const first = store.issue(scope, { value: "a".repeat(40) });

        expect(() => store.issue(scope, { value: "b".repeat(40) })).toThrow(
            /capacity|storage limit/i,
        );
        expect(store.consume(first.confirmToken, scope)).toEqual({ value: "a".repeat(40) });
        const second = store.issue(scope, { value: "b".repeat(40) });
        expect(store.consume(second.confirmToken, scope)).toEqual({ value: "b".repeat(40) });
    });

    it("rejects one preview that exceeds the total byte limit", () => {
        const store = new ConfirmationTokenStore({ maxTotalBytes: 16 });
        expect(() => store.issue(scope, { value: "too-large" })).toThrow(/storage limit/i);
    });

    it("prunes a token at the exact expiry boundary before checking capacity", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, maxEntries: 1, now });
        const expired = store.issue(scope, preview);

        clock.t += 1000;

        const replacement = store.issue(scope, preview);
        expect(() => store.consume(expired.confirmToken, scope)).toThrow(/not issued|expired/i);
        expect(store.consume(replacement.confirmToken, scope)).toEqual(preview);
    });
});

describe("ConfirmationTokenStore canonical-hash invariance", () => {
    it("consumes an array preview with its exact canonical contents", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const arrayPreview = [
            { id: "p-1", action: "delete" },
            { id: "p-2", action: "archive" },
        ];

        const issued = store.issue(scope, arrayPreview);
        const consumed = store.consume(issued.confirmToken, scope);

        expect(consumed).toEqual(arrayPreview);
        expect(Array.isArray(consumed)).toBe(true);
    });

    it("stores a canonical preview clone and returns it after scoped consumption", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const scope = {
            toolName: "clockify_projects_delete",
            workspaceId: "000000000000000000000900",
            risk: "destructive" as const,
            businessArgs: { projectId: "p-1", nested: { b: 2, a: 1 } },
        };
        const source = { z: 2, a: { value: "original" }, omitted: undefined };
        const issued = store.issue(scope, source);
        source.a.value = "mutated";

        const consumed = store.consume(issued.confirmToken, {
            ...scope,
            businessArgs: { nested: { a: 1, b: 2 }, projectId: "p-1" },
        });

        expect(consumed).toEqual({ a: { value: "original" }, z: 2 });
        expect(issued.previewHash).toBe(hashCanonical({ a: { value: "original" }, z: 2 }));
    });

    it("binds a preview token to tool, workspace, risk, and arguments", () => {
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
            const issued = store.issue(scope, { id: "p-1" });
            expect(() => store.consume(issued.confirmToken, changed)).toThrow(/does not match/i);
            expect(() => store.consume(issued.confirmToken, scope)).toThrow(
                /already used|not issued/i,
            );
        }
    });

    it("validates when equivalent args arrive with keys in a different order", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const argsAtIssue = { b: 2, a: 1, nested: { y: 2, x: 1 } };
        const argsAtConfirm = { nested: { x: 1, y: 2 }, a: 1, b: 2 };

        const issued = store.issue(
            {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: argsAtIssue,
            },
            { preview: true },
        );

        expect(() =>
            store.consume(issued.confirmToken, {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: argsAtConfirm,
            }),
        ).not.toThrow();
    });

    it("rejects when args actually differ", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const issued = store.issue(
            {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: { a: 1 },
            },
            { p: 1 },
        );

        expect(() =>
            store.consume(issued.confirmToken, {
                toolName: "clockify_projects_delete",
                workspaceId: "ws",
                risk: "destructive",
                businessArgs: { a: 2 },
            }),
        ).toThrow(/does not match/i);
    });

    it("rejects a bogus token outright", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        store.issue(scope, preview);

        expect(() => store.consume("not-a-real-token", scope)).toThrow(
            /was not issued|expired|already used/i,
        );
    });

    it("is one-use even with identical args", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const issued = store.issue(scope, preview);

        expect(() => store.consume(issued.confirmToken, scope)).not.toThrow();
        expect(() => store.consume(issued.confirmToken, scope)).toThrow();
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

    it("round-trips own __proto__ keys through the stored canonical preview", () => {
        const store = new ConfirmationTokenStore();
        const source = JSON.parse(
            '{"__proto__":{"top":true},"nested":{"__proto__":{"inner":true}}}',
        ) as unknown;
        const issued = store.issue(scope, source);

        const consumed = store.consume(issued.confirmToken, scope) as Record<string, unknown>;

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
