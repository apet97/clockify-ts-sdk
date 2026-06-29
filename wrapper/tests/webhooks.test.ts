import { describe, expect, it } from "vitest";

import {
    CLOCKIFY_SIGNATURE_HEADER,
    constructEvent,
    getClockifySignatureToken,
    verifyClockifyWebhook,
    WebhookSignatureMismatchError,
} from "../webhooks.js";

const TOKEN = "a".repeat(32); // 32-char fixed-length per the live system
const PAYLOAD = JSON.stringify({
    webhookEvent: "NEW_TAG",
    payload: { id: "tag-123", name: "fixture-tag" },
});

describe("getClockifySignatureToken", () => {
    it("reads from a Headers instance (case-insensitive)", () => {
        const h = new Headers({ "clockify-signature-token": TOKEN });
        expect(getClockifySignatureToken(h)).toBe(TOKEN);
    });

    it("reads from a plain Record (case-insensitive)", () => {
        expect(getClockifySignatureToken({ "Clockify-Signature-Token": TOKEN })).toBe(TOKEN);
        expect(getClockifySignatureToken({ "clockify-signature-token": TOKEN })).toBe(TOKEN);
    });

    it("reads from a Record where the value is a string[] (Node http style)", () => {
        expect(getClockifySignatureToken({ "clockify-signature-token": [TOKEN, "other"] })).toBe(
            TOKEN,
        );
    });

    it("reads from a Map", () => {
        const m = new Map([["Clockify-Signature-Token", TOKEN]]);
        expect(getClockifySignatureToken(m)).toBe(TOKEN);
    });

    it("reads from an array of [name, value] pairs", () => {
        expect(getClockifySignatureToken([["clockify-signature-token", TOKEN]])).toBe(TOKEN);
    });

    it("returns undefined when the header is missing", () => {
        expect(getClockifySignatureToken({})).toBeUndefined();
        expect(getClockifySignatureToken(new Headers())).toBeUndefined();
    });
});

describe("verifyClockifyWebhook", () => {
    it("returns true on a matching token", () => {
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": TOKEN },
                expectedToken: TOKEN,
            }),
        ).toBe(true);
    });

    it("returns false on a mismatched token (same length)", () => {
        const wrong = "b".repeat(32);
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": wrong },
                expectedToken: TOKEN,
            }),
        ).toBe(false);
    });

    it("returns false on a mismatched token (different length)", () => {
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": "short" },
                expectedToken: TOKEN,
            }),
        ).toBe(false);
    });

    it("returns false when the header is missing", () => {
        expect(verifyClockifyWebhook({ headers: {}, expectedToken: TOKEN })).toBe(false);
    });
});

describe("constructEvent", () => {
    it("returns the parsed payload on a matching signature", () => {
        const event = constructEvent<{ webhookEvent: string }>({
            headers: { "Clockify-Signature-Token": TOKEN },
            payload: PAYLOAD,
            expectedToken: TOKEN,
        });
        expect(event.webhookEvent).toBe("NEW_TAG");
    });

    it("accepts a Buffer payload", () => {
        const event = constructEvent<{ webhookEvent: string }>({
            headers: { "Clockify-Signature-Token": TOKEN },
            payload: Buffer.from(PAYLOAD, "utf8"),
            expectedToken: TOKEN,
        });
        expect(event.webhookEvent).toBe("NEW_TAG");
    });

    it("throws WebhookSignatureMismatchError when the header is missing", () => {
        expect(() =>
            constructEvent({ headers: {}, payload: PAYLOAD, expectedToken: TOKEN }),
        ).toThrow(WebhookSignatureMismatchError);
    });

    it("throws WebhookSignatureMismatchError without echoing the received token on mismatch", () => {
        const wrong = "b".repeat(32);
        try {
            constructEvent({
                headers: { "Clockify-Signature-Token": wrong },
                payload: PAYLOAD,
                expectedToken: TOKEN,
            });
            expect.unreachable("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(WebhookSignatureMismatchError);
            expect(err).not.toHaveProperty("received");
            expect(JSON.stringify(err)).not.toContain(wrong);
        }
    });

    it("throws SyntaxError on invalid JSON (signature valid)", () => {
        expect(() =>
            constructEvent({
                headers: { "Clockify-Signature-Token": TOKEN },
                payload: "{not json",
                expectedToken: TOKEN,
            }),
        ).toThrow(SyntaxError);
    });
});

describe("CLOCKIFY_SIGNATURE_HEADER", () => {
    it("is the documented header name", () => {
        expect(CLOCKIFY_SIGNATURE_HEADER).toBe("Clockify-Signature-Token");
    });
});

describe("empty-token fail-closed (wrapper-webhook-security-2)", () => {
    it("verifyClockifyWebhook returns false when expectedToken and the signature header are both empty", () => {
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": "" },
                expectedToken: "",
            }),
        ).toBe(false);
    });

    it("constructEvent throws WebhookSignatureMismatchError when expectedToken and the signature header are both empty", () => {
        expect(() =>
            constructEvent({
                headers: { "Clockify-Signature-Token": "" },
                payload: JSON.stringify({ attacker: "payload", webhookEvent: "NEW_TAG" }),
                expectedToken: "",
            }),
        ).toThrow(WebhookSignatureMismatchError);
    });

    it("verifyClockifyWebhook still returns false for a non-empty header against an empty expectedToken", () => {
        expect(
            verifyClockifyWebhook({
                headers: { "Clockify-Signature-Token": TOKEN },
                expectedToken: "",
            }),
        ).toBe(false);
    });
});
