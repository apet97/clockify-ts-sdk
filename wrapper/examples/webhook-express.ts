/**
 * Express-style Clockify webhook endpoint: verify the signature token, then act
 * on the typed event. Shown as a pure handler function so no server is started —
 * drop `handler` into your own Express/Hono/Fastify/Bun.serve app.
 *
 * Env: CLOCKIFY_WEBHOOK_TOKEN (the token you set when creating the webhook).
 * Mode: mock-safe — no live calls; the smoke at the bottom feeds it sample requests.
 * Cleanup: none.
 * Expected output:
 *   200 ok (valid signature)
 *   401 invalid signature (missing/forged token)
 *
 * Run: `npx tsx examples/webhook-express.ts`
 */
import { WebhookSignatureMismatchError, constructEvent } from "clockify-sdk-ts-115";

interface ExpressLikeRequest {
    headers: Record<string, string>;
    rawBody: string;
}
interface ExpressLikeResponse {
    status: (code: number) => { send: (body: string) => void };
}

// app.post("/clockify", express.raw({ type: "application/json" }), handler)
export function handler(req: ExpressLikeRequest, res: ExpressLikeResponse): void {
    try {
        const event = constructEvent<{ webhookEvent: string }>({
            headers: req.headers,
            payload: req.rawBody,
            expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN ?? "set-CLOCKIFY_WEBHOOK_TOKEN",
        });
        console.log("received event:", event.webhookEvent);
        res.status(200).send("ok");
    } catch (err) {
        if (err instanceof WebhookSignatureMismatchError) {
            res.status(401).send("invalid signature");
            return;
        }
        res.status(400).send("invalid payload");
    }
}

// --- smoke (no server) ---
function fakeRes(label: string): ExpressLikeResponse {
    return { status: (code) => ({ send: (body) => console.log(`${label}: ${code} ${body}`) }) };
}
const token = process.env.CLOCKIFY_WEBHOOK_TOKEN ?? "demo-token-32-chars-aaaaaaaaaaaa";
const body = JSON.stringify({ webhookEvent: "NEW_TIME_ENTRY" });
handler({ headers: { "Clockify-Signature-Token": token }, rawBody: body }, fakeRes("valid"));
handler({ headers: {}, rawBody: body }, fakeRes("missing token"));
