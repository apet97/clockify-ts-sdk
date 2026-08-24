import { describe, expect, it, vi } from "vitest";

import { createContext } from "../src/client.js";

describe("remote Clockify request deadline", () => {
    it("aborts a stalled SDK fetch at the configured deadline", async () => {
        const observedSignals: AbortSignal[] = [];
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const observedSignal =
                init?.signal ?? (input instanceof Request ? input.signal : undefined);
            if (observedSignal) observedSignals.push(observedSignal);
            return await new Promise<Response>((_resolve, reject) => {
                const fail = (): void => {
                    const reason = observedSignal?.reason;
                    reject(reason instanceof Error ? reason : new Error("request aborted"));
                };
                if (observedSignal?.aborted) fail();
                else observedSignal?.addEventListener("abort", fail, { once: true });
            });
        });
        const context = createContext({
            apiKey: "fixture-key",
            workspaceId: "000000000000000000000000",
            routing: { profile: "global" },
            fetch: dispatch,
            timeoutInSeconds: 0.01,
        });

        await expect(context.client.users.getCurrentUser()).rejects.toThrow();
        expect(dispatch).toHaveBeenCalled();
        expect(observedSignals.length).toBeGreaterThan(0);
        expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
    });
});
