import { AsyncLocalStorage } from "node:async_hooks";

const requestSignal = new AsyncLocalStorage<AbortSignal | undefined>();

/**
 * Run one MCP handler with the transport's cancellation signal attached to
 * its asynchronous call chain. The SDK does not pass handler metadata into
 * individual tools, so this keeps cancellation request-local without adding
 * a signal argument to every tool.
 */
export function withRequestSignal<T>(extra: unknown, run: () => T): T {
    return requestSignal.run(signalFromExtra(extra), run);
}

/** Current request signal for request-local helpers such as in-flight memos. */
export function currentRequestSignal(): AbortSignal | undefined {
    return requestSignal.getStore();
}

/** Stop before entering a tool whose transport request was already cancelled. */
export function throwIfRequestAborted(): void {
    const signal = currentRequestSignal();
    if (signal?.aborted) throw normalizedAbortError(signal);
}

/**
 * Add the current MCP request signal at the final fetch boundary. A signal
 * already supplied by the SDK or a custom caller remains active as well.
 */
export function requestSignalFetch(dispatch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const scopedSignal = currentRequestSignal();
        if (scopedSignal === undefined) return await dispatch(input, init);

        const inputSignal =
            init?.signal !== undefined
                ? (init.signal ?? undefined)
                : input instanceof Request
                  ? input.signal
                  : undefined;
        const effectiveSignal = combineSignals(scopedSignal, inputSignal);
        return await abortableDispatch(effectiveSignal, () =>
            dispatch(input, { ...init, signal: effectiveSignal }),
        );
    };
}

function signalFromExtra(extra: unknown): AbortSignal | undefined {
    if (extra === null || typeof extra !== "object" || !("signal" in extra)) return undefined;
    const signal = extra.signal;
    return signal instanceof AbortSignal ? signal : undefined;
}

function combineSignals(request: AbortSignal, existing: AbortSignal | undefined): AbortSignal {
    if (existing === undefined || existing === request) return request;
    return AbortSignal.any([request, existing]);
}

function normalizedAbortError(signal: AbortSignal): DOMException {
    const reason = signal.reason;
    if (reason instanceof DOMException && reason.name === "AbortError") return reason;
    const message =
        typeof reason === "string" && reason.length > 0
            ? reason
            : reason instanceof Error && reason.message.length > 0
              ? reason.message
              : "The operation was aborted";
    const error = new DOMException(message, "AbortError");
    if (reason !== undefined) {
        Object.defineProperty(error, "cause", { value: reason, configurable: true });
    }
    return error;
}

function abortableDispatch(signal: AbortSignal, start: () => Promise<Response>): Promise<Response> {
    if (signal.aborted) return Promise.reject(normalizedAbortError(signal));
    return new Promise<Response>((resolve, reject) => {
        let settled = false;
        const finish = (complete: () => void): void => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            complete();
        };
        const onAbort = (): void => {
            finish(() => {
                reject(normalizedAbortError(signal));
            });
        };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
            return;
        }
        let pending: Promise<Response>;
        try {
            pending = start();
        } catch (cause) {
            finish(() => { reject(dispatchError(cause)); });
            return;
        }
        pending.then(
            (response) => {
                finish(() => {
                    resolve(response);
                });
            },
            (cause: unknown) => {
                finish(() => {
                    reject(signal.aborted ? normalizedAbortError(signal) : dispatchError(cause));
                });
            },
        );
    });
}

function dispatchError(cause: unknown): Error {
    if (cause instanceof Error) return cause;
    return new Error(typeof cause === "string" ? cause : "Fetch failed", { cause });
}
