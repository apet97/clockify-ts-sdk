/** Stop consuming a hostile or oversized stream without delaying its response. */
export function cancelReaderWithoutWaiting<T>(
    reader: ReadableStreamDefaultReader<T>,
): void {
    try {
        void reader.cancel().catch(() => {});
    } catch {
        // Cleanup must not replace the bounded-read result.
    }
}

/** Cancel an unread body without waiting for a hostile source's cleanup hook. */
export function cancelStreamWithoutWaiting<T>(stream: ReadableStream<T>): void {
    try {
        void stream.cancel().catch(() => {});
    } catch {
        // Cleanup must not replace the bounded-read result.
    }
}

/** Release a reader when possible; an unresolved underlying read can retain it. */
export function releaseReaderLock<T>(reader: ReadableStreamDefaultReader<T>): void {
    try {
        reader.releaseLock();
    } catch {
        // The discarded response owns any unresolved read from this point onward.
    }
}

/** Decode protocol JSON without merging distinct malformed byte sequences. */
export function decodeUtf8Strict(bytes: Uint8Array): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Race one stream read against its owning request deadline or disconnect. */
export function readStreamChunk<T>(
    reader: ReadableStreamDefaultReader<T>,
    signal: AbortSignal,
): ReturnType<ReadableStreamDefaultReader<T>["read"]> {
    if (signal.aborted) {
        cancelReaderWithoutWaiting(reader);
        return Promise.reject(new Error("stream read aborted"));
    }
    return new Promise((resolve, reject) => {
        const onAbort = (): void => {
            cancelReaderWithoutWaiting(reader);
            reject(new Error("stream read aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        void reader.read().then(resolve, reject).finally(() => {
            signal.removeEventListener("abort", onAbort);
        });
    });
}
