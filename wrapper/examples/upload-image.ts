/**
 * Upload a tiny PNG via the `client.files.uploadImage` endpoint —
 * exercises the SDK's locally generated multipart file-upload path.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/upload-image.ts`
 *
 * In a real script you'd pass a `File`, `Blob`, `Buffer`, `Uint8Array`,
 * or string field value; here we manufacture a 1-byte PNG so the example
 * needs no on-disk asset.
 *
 * WARNING: writes to your sandbox workspace.
 */
import { createClockifyClient, ClockifyApiError } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
if (!apiKey) {
    console.error("Set CLOCKIFY_API_KEY to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

// 1-byte "PNG" — enough to exercise the multipart wire format
// without making the example depend on a real image file.
const tinyPng = new Blob([new Uint8Array([0x89])], { type: "image/png" });

try {
    const uploaded = await client.files.uploadImage({ file: tinyPng });
    console.log("Uploaded:", JSON.stringify(uploaded));
} catch (err) {
    if (err instanceof ClockifyApiError) {
        console.error(`Clockify API failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected error:", err);
    }
    process.exit(1);
}
