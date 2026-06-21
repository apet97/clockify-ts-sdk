import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
    ConfirmationTokenStore,
    confirmationPayload,
    hashCanonical,
    type ConfirmationPayload,
} from "../src/orchestration/confirmation.js";

function makeClock(start = 1_000_000) {
    const clock = { t: start };
    return { now: () => clock.t, clock };
}

const payload: ConfirmationPayload = {
    toolName: "clockify_projects_delete",
    workspaceId: "000000000000000000000900",
    riskClass: "destructive-delete",
    argsHash: "a",
    previewHash: "b",
};

describe("ConfirmationTokenStore TTL / expiry", () => {
    it("accepts a token validated before the TTL elapses", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = store.issue(payload);

        clock.t += 999;

        expect(() => store.validate(issued.confirmToken, payload)).not.toThrow();
    });

    it("rejects a token once now reaches the expiry boundary", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = store.issue(payload);

        clock.t += 1000;

        expect(() => store.validate(issued.confirmToken, payload)).toThrow(/expired/i);
    });

    it("rejects a token well past the TTL", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const issued = store.issue(payload);

        clock.t += 10_000;

        expect(() => store.validate(issued.confirmToken, payload)).toThrow(
            /expired|was not issued/i,
        );
    });

    it("substitutes the 5-minute default when ttlMs is negative", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: -5, now });
        const issued = store.issue(payload);

        // With ttlMs honored verbatim the token would already be expired; the
        // guard falls back to the 5-minute default, so 1ms later it still validates.
        clock.t += 1;

        expect(() => store.validate(issued.confirmToken, payload)).not.toThrow();
    });

    it("substitutes the 5-minute default when ttlMs is zero", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 0, now });
        const issued = store.issue(payload);

        clock.t += 1;

        expect(() => store.validate(issued.confirmToken, payload)).not.toThrow();
    });

    it("prunes expired tokens before issuing a fresh token", () => {
        const { now, clock } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 1000, now });
        const first = store.issue(payload);

        clock.t += 5000;

        const second = store.issue(payload);
        expect(second.confirmToken).not.toBe(first.confirmToken);
        expect(() => store.validate(first.confirmToken, payload)).toThrow();
        expect(() => store.validate(second.confirmToken, payload)).not.toThrow();
    });
});

describe("ConfirmationTokenStore canonical-hash invariance", () => {
    it("validates when equivalent args arrive with keys in a different order", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const argsAtIssue = { b: 2, a: 1, nested: { y: 2, x: 1 } };
        const argsAtConfirm = { nested: { x: 1, y: 2 }, a: 1, b: 2 };

        const issued = store.issue(
            confirmationPayload("t", "ws", "r", argsAtIssue, { preview: true }),
        );

        expect(() =>
            store.validate(
                issued.confirmToken,
                confirmationPayload("t", "ws", "r", argsAtConfirm, { preview: true }),
            ),
        ).not.toThrow();
    });

    it("rejects when args actually differ", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const issued = store.issue(confirmationPayload("t", "ws", "r", { a: 1 }, { p: 1 }));

        expect(() =>
            store.validate(
                issued.confirmToken,
                confirmationPayload("t", "ws", "r", { a: 2 }, { p: 1 }),
            ),
        ).toThrow(/does not match/i);
    });

    it("rejects a bogus token outright", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        store.issue(payload);

        expect(() => store.validate("not-a-real-token", payload)).toThrow(
            /was not issued|expired|already used/i,
        );
    });

    it("is one-use even with identical args", () => {
        const { now } = makeClock();
        const store = new ConfirmationTokenStore({ ttlMs: 60_000, now });
        const issued = store.issue(payload);

        expect(() => store.validate(issued.confirmToken, payload)).not.toThrow();
        expect(() => store.validate(issued.confirmToken, payload)).toThrow();
    });
});

describe("hashCanonical order independence", () => {
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
        const jsonLeaf = fc.oneof(fc.integer(), fc.string({ maxLength: 12 }), fc.boolean(), fc.constant(null));

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
