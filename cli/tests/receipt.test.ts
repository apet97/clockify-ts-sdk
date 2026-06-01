import { describe, expect, it, vi } from "vitest";

import { printReceipt } from "../src/receipt.js";
import type { OutputOptions } from "../src/output.js";

describe("printReceipt", () => {
    const jsonOutput: OutputOptions = { mode: "json", color: false };

    it("prints additive machine-readable receipts with legacy top-level fields", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            printReceipt(
                {
                    ok: true,
                    action: "clients.create",
                    entity: "client",
                    ids: { clientId: "client_123" },
                    changed: { created: [{ type: "client", id: "client_123", name: "Acme" }] },
                    data: { id: "client_123", name: "Acme" },
                    warnings: [],
                    next: [],
                },
                jsonOutput,
            );
            const payload = JSON.parse(spy.mock.calls[0]?.[0] as string);
            expect(payload).toMatchObject({
                ok: true,
                action: "clients.create",
                entity: "client",
                id: "client_123",
                name: "Acme",
                ids: { clientId: "client_123" },
            });
            expect(payload.changed.created[0]).toEqual({
                type: "client",
                id: "client_123",
                name: "Acme",
            });
        } finally {
            spy.mockRestore();
        }
    });
});
