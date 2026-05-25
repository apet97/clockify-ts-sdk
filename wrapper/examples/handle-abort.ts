/**
 * Handle caller-initiated cancellation
 * -------------------------------------
 *
 * Pass an `AbortSignal` to any resource method via per-call
 * `RequestOptions.abortSignal`. When the signal fires before the
 * response, the SDK throws `ClockifyAbortError` — a subclass of
 * `ClockifyApiError`, narrowable with `isAbortError(err)`.
 *
 * Do NOT retry on `ClockifyAbortError` — the caller asked for
 * a stop. Compare to `ClockifyApiTimeoutError`, which IS
 * retryable (request exceeded `timeoutInSeconds`).
 */
import {
    createClockifyClient,
    isAbortError,
    promoteApiError,
} from "clockify-sdk-ts";

async function main(): Promise<void> {
    const client = createClockifyClient();
    const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID!;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    try {
        const tags = await client.tags.list(
            { workspaceId },
            { abortSignal: controller.signal },
        );
        console.log(`fetched ${tags.length} tags`);
    } catch (raw) {
        const err = promoteApiError(raw);
        if (isAbortError(err)) {
            console.log("aborted by caller — not retrying");
            return;
        }
        throw err;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
