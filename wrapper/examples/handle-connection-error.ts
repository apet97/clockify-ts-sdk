/**
 * Handle network failures (no HTTP response)
 * ------------------------------------------
 *
 * When `fetch` fails before getting a response — DNS failure,
 * TLS handshake error, connection reset, offline machine — the
 * SDK throws `ClockifyConnectionError`. Narrow with
 * `isConnectionError(err)` and either retry with backoff or
 * surface as a user-facing "offline?" message.
 *
 * Run this against an unreachable host to see the path in
 * action (CLOCKIFY_API_KEY=test bun examples/handle-connection-error.ts).
 */
import {
    createClockifyClient,
    isConnectionError,
    promoteApiError,
} from "clockify-sdk-ts";

async function main(): Promise<void> {
    const client = createClockifyClient({
        apiKey: process.env.CLOCKIFY_API_KEY!,
        // Force a connection failure: point at a port nothing's listening on.
        environment: "http://127.0.0.1:1",
    });

    try {
        await client.tags.list({
            workspaceId: process.env.CLOCKIFY_WORKSPACE_ID ?? "x",
        });
    } catch (raw) {
        const err = promoteApiError(raw);
        if (isConnectionError(err)) {
            console.log("connection failed:", (err as Error).message);
            console.log("cause:", err instanceof Error ? err.cause : undefined);
            return;
        }
        throw err;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
