/**
 * Express-style webhook handler showing both verification paths:
 *
 * 1. `verifyClockifyWebhook` — boolean check, handler maps to
 *    HTTP status itself.
 * 2. `constructEvent` — throws `WebhookSignatureMismatchError`
 *    on bad signature + `SyntaxError` on bad JSON.
 *
 * This file is pure illustration — no server is started. Drop
 * the handler into your own Express/Hono/Fastify/Bun.serve app.
 */
import {
    constructEvent,
    verifyClockifyWebhook,
    WebhookSignatureMismatchError,
} from "clockify-sdk-ts-115";

// --- Pattern 1: boolean check ---
function explicitlyMappedHandler(req: { headers: Record<string, string>; body: string }): {
    status: number;
    body: string;
} {
    const ok = verifyClockifyWebhook({
        headers: req.headers,
        expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN!,
    });
    if (!ok) return { status: 401, body: "invalid signature" };
    const event = JSON.parse(req.body) as { webhookEvent: string };
    console.log("event:", event.webhookEvent);
    return { status: 200, body: "ok" };
}

// --- Pattern 2: throw + map ---
function throwBasedHandler(req: { headers: Record<string, string>; body: string }): {
    status: number;
    body: string;
} {
    try {
        const event = constructEvent<{ webhookEvent: string }>({
            headers: req.headers,
            payload: req.body,
            expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN!,
        });
        console.log("event:", event.webhookEvent);
        return { status: 200, body: "ok" };
    } catch (err) {
        if (err instanceof WebhookSignatureMismatchError) {
            return { status: 401, body: "invalid signature" };
        }
        return { status: 400, body: "invalid payload" };
    }
}

// Smoke: feed both handlers a valid + an invalid request to show
// the wiring without needing a real Clockify webhook delivery.
const goodSignature = process.env.CLOCKIFY_WEBHOOK_TOKEN ?? "demo-token-32-chars-aaaaaaaaaaaa";
const goodBody = JSON.stringify({ webhookEvent: "NEW_TAG" });

console.log(
    "explicit ok:",
    explicitlyMappedHandler({
        headers: { "Clockify-Signature-Token": goodSignature },
        body: goodBody,
    }),
);
console.log(
    "throw ok:",
    throwBasedHandler({
        headers: { "Clockify-Signature-Token": goodSignature },
        body: goodBody,
    }),
);
console.log("throw 401:", throwBasedHandler({ headers: {}, body: goodBody }));
