/**
 * Fixture-driven tests for `constructEvent` against 4 representative
 * Clockify webhook event shapes:
 *
 * - NEW_PROJECT (PROJECT payload)
 * - NEW_TIME_ENTRY (TIME_ENTRY payload)
 * - TIMER_STOPPED (TIME_ENTRY payload)
 * - APPROVAL_REQUEST_STATUS_UPDATED (APPROVAL_REQUEST payload)
 *
 * Fixtures are SYNTHESIZED, not live-probed. Once the open question
 * `webhook.signature-scheme.shared-secret-not-hmac-doc-only` in
 * `spec/evidence/discrepancies.md` is closed via a real probe, we
 * can swap these for actual captures.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { constructEvent, WebhookSignatureMismatchError } from "../webhooks.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures/webhook-events");

interface WebhookFixture {
    comment?: string;
    expectedToken: string;
    headers: Record<string, string>;
    payload: { webhookEvent: string; payloadType?: string; payload: unknown };
}

const fixtures = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
        const json = JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as WebhookFixture;
        return { file: f, ...json };
    });

describe("constructEvent — golden webhook fixtures", () => {
    it("loaded the expected number of fixtures", () => {
        expect(fixtures.length).toBe(4);
    });

    for (const { file, headers, payload, expectedToken } of fixtures) {
        it(`parses ${file} with the matching token`, () => {
            const event = constructEvent<typeof payload>({
                headers,
                payload: JSON.stringify(payload),
                expectedToken,
            });
            expect(event.webhookEvent).toBe(payload.webhookEvent);
            expect(event.payload).toEqual(payload.payload);
        });

        it(`rejects ${file} with a wrong token`, () => {
            expect(() =>
                constructEvent({
                    headers,
                    payload: JSON.stringify(payload),
                    expectedToken: "wrong-token-".padEnd(32, "x"),
                }),
            ).toThrow(WebhookSignatureMismatchError);
        });

        it(`rejects ${file} with the header stripped`, () => {
            const stripped: Record<string, string> = {};
            for (const [k, v] of Object.entries(headers)) {
                if (k.toLowerCase() !== "clockify-signature-token") stripped[k] = v;
            }
            expect(() =>
                constructEvent({
                    headers: stripped,
                    payload: JSON.stringify(payload),
                    expectedToken,
                }),
            ).toThrow(WebhookSignatureMismatchError);
        });
    }
});
