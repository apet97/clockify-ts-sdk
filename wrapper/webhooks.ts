/**
 * Clockify webhook verification.
 *
 * Each webhook in Clockify has a 32-char `authToken` generated at
 * create time (rotatable via the `/token` endpoint). Clockify
 * delivers that token verbatim in the `Clockify-Signature-Token`
 * HTTP header on every webhook call. Verification is therefore a
 * constant-time string compare between the received header and the
 * stored token — NOT an HMAC over the payload. (Reference:
 * `GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/openapi-fragments/webhooks-a.yaml`:
 * `Header value Clockify sends as Clockify-Signature-Token; rotate
 * via /token endpoint.`)
 *
 * Two helpers:
 * - `verifyClockifyWebhook({ headers, expectedToken })` returns
 *   `true` / `false` (no throw) — use this when you want to handle
 *   the failure case yourself.
 * - `constructEvent({ headers, payload, expectedToken })` verifies
 *   AND parses the JSON payload, throwing
 *   `WebhookSignatureMismatchError` on mismatch / missing header
 *   and `SyntaxError` on invalid JSON. Use this for the common
 *   "drop bad webhooks" pattern.
 *
 * The signature header is case-insensitive (per HTTP spec). Headers
 * input accepts `Headers`, `Map<string,string>`, plain `Record`,
 * or `Array<[name, value]>` — the same shapes Node's `http`,
 * `undici`, and the standard `Headers` class emit.
 */
import { timingSafeEqual } from "node:crypto";

/** The HTTP header Clockify sends on every webhook delivery,
 *  containing the per-webhook auth token. Case-insensitive per HTTP
 *  spec; the helpers in this module normalize. */
export const CLOCKIFY_SIGNATURE_HEADER = "Clockify-Signature-Token" as const;

/** Accepted shapes for the headers input — covers Node's `http`
 *  (object), undici/fetch (`Headers`), Express (`req.headers`),
 *  and `Map`-based router middleware. */
export type WebhookHeadersInput =
    | Headers
    | Map<string, string>
    | ReadonlyArray<readonly [string, string]>
    | Readonly<Record<string, string | string[] | undefined>>;

/** Thrown by {@link constructEvent} when the
 *  `Clockify-Signature-Token` header is missing or doesn't match. */
export class WebhookSignatureMismatchError extends Error {
    /** The header value that was actually received (if any). Useful
     *  for debugging without re-reading the request. */
    public readonly received: string | undefined;

    constructor(message: string, opts?: { received?: string }) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
        this.name = "WebhookSignatureMismatchError";
        this.received = opts?.received;
    }
}

/**
 * Extracts the `Clockify-Signature-Token` header value (case-
 * insensitive lookup) from any supported headers shape. Returns
 * the first value if the header appears as a string-array, or
 * `undefined` if absent.
 */
export function getClockifySignatureToken(headers: WebhookHeadersInput): string | undefined {
    const target = CLOCKIFY_SIGNATURE_HEADER.toLowerCase();

    if (typeof Headers !== "undefined" && headers instanceof Headers) {
        return headers.get(CLOCKIFY_SIGNATURE_HEADER) ?? undefined;
    }
    if (headers instanceof Map) {
        for (const [key, value] of headers) {
            if (key.toLowerCase() === target) return value;
        }
        return undefined;
    }
    if (Array.isArray(headers)) {
        for (const [key, value] of headers) {
            if (key.toLowerCase() === target) return value;
        }
        return undefined;
    }
    // Plain Record<string, string | string[] | undefined>.
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
        if (key.toLowerCase() !== target) continue;
        if (typeof value === "string") return value;
        if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
    return undefined;
}

/** Input shape for {@link verifyClockifyWebhook}. */
export interface VerifyClockifyWebhookInput {
    /** Incoming HTTP request headers. */
    headers: WebhookHeadersInput;
    /** The 32-char `authToken` Clockify returned when the webhook was
     *  created (or last rotated). Treat as a credential; never log. */
    expectedToken: string;
}

/**
 * Returns `true` if the request's `Clockify-Signature-Token` header
 * is present and matches `expectedToken` via constant-time compare.
 * Returns `false` (no throw) on missing header or mismatch.
 *
 * Use this when you want to handle the failure case yourself
 * (e.g. log + return 401 from your handler). Use {@link constructEvent}
 * for the common "throw + reject" pattern.
 *
 * @example
 * ```ts
 * import { verifyClockifyWebhook } from "clockify-sdk-ts/webhooks";
 *
 * app.post("/webhook", (req, res) => {
 *   if (!verifyClockifyWebhook({
 *     headers: req.headers,
 *     expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN!,
 *   })) {
 *     return res.status(401).send("invalid signature");
 *   }
 *   handle(req.body);
 *   res.status(200).end();
 * });
 * ```
 */
export function verifyClockifyWebhook(input: VerifyClockifyWebhookInput): boolean {
    const received = getClockifySignatureToken(input.headers);
    if (received == null) return false;
    return constantTimeStringEqual(received, input.expectedToken);
}

/** Input shape for {@link constructEvent}. */
export interface ConstructEventInput {
    /** Incoming HTTP request headers. */
    headers: WebhookHeadersInput;
    /** The raw request body — JSON-encoded string or Buffer/Uint8Array. */
    payload: string | Uint8Array;
    /** The 32-char `authToken` Clockify returned at webhook create
     *  time (or last rotation). Treat as a credential; never log. */
    expectedToken: string;
}

/**
 * Verifies the signature header AND parses the JSON payload in one
 * step. Throws on any failure so the caller's handler can be
 * straight-line code.
 *
 * @throws {WebhookSignatureMismatchError} when the header is missing
 *   or doesn't match `expectedToken`.
 * @throws {SyntaxError} when the payload is not valid JSON.
 *
 * @example
 * ```ts
 * import { constructEvent, WebhookSignatureMismatchError } from "clockify-sdk-ts/webhooks";
 *
 * app.post("/webhook", express.text({ type: "*\/*" }), (req, res) => {
 *   try {
 *     const event = constructEvent({
 *       headers: req.headers,
 *       payload: req.body,
 *       expectedToken: process.env.CLOCKIFY_WEBHOOK_TOKEN!,
 *     });
 *     handle(event);
 *     res.status(200).end();
 *   } catch (err) {
 *     if (err instanceof WebhookSignatureMismatchError) {
 *       return res.status(401).send("invalid signature");
 *     }
 *     return res.status(400).send("invalid payload");
 *   }
 * });
 * ```
 */
export function constructEvent<TPayload = unknown>(input: ConstructEventInput): TPayload {
    const received = getClockifySignatureToken(input.headers);
    if (received == null) {
        throw new WebhookSignatureMismatchError(
            `Missing ${CLOCKIFY_SIGNATURE_HEADER} header on Clockify webhook delivery.`,
        );
    }
    if (!constantTimeStringEqual(received, input.expectedToken)) {
        throw new WebhookSignatureMismatchError(
            `${CLOCKIFY_SIGNATURE_HEADER} header did not match the expected webhook token.`,
            { received },
        );
    }
    const text =
        typeof input.payload === "string"
            ? input.payload
            : Buffer.from(input.payload).toString("utf8");
    return JSON.parse(text) as TPayload;
}

/**
 * Constant-time string equality. Pads to equal length to avoid
 * `timingSafeEqual` throwing on length mismatch; the early-out on
 * length is fine since the token length (32) is fixed.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}
