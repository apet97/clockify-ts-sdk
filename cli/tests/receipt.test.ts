import { describe, expect, it, vi } from "vitest";

import type { OutputOptions } from "../src/output.js";
import { printReceipt } from "../src/receipt.js";

describe("printReceipt", () => {
    const jsonOutput: OutputOptions = { mode: "json", color: false };
    const ndjsonOutput: OutputOptions = { mode: "ndjson", color: false };
    const tableOutput: OutputOptions = { mode: "table", color: false };

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

    it("prints default receipt collections in ndjson mode", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            printReceipt(
                {
                    ok: true,
                    action: "tags.create",
                    entity: "tag",
                    ids: { tagId: "tag_123" },
                    data: { id: "tag_123", name: "Focus" },
                },
                ndjsonOutput,
            );
            const payload = JSON.parse(spy.mock.calls[0]?.[0] as string);
            expect(payload.changed).toEqual({});
            expect(payload.warnings).toEqual([]);
            expect(payload.next).toEqual([]);
        } finally {
            spy.mockRestore();
        }
    });

    it("keeps receipt-owned fields authoritative when API data collides", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            printReceipt(
                {
                    ok: true,
                    action: "projects.create",
                    entity: "project",
                    ids: { projectId: "project_123" },
                    data: {
                        id: "project_123",
                        ok: false,
                        action: "spoofed.action",
                        entity: "spoofed",
                        ids: { projectId: "spoofed" },
                        changed: { deleted: [] },
                        warnings: ["spoofed warning"],
                        next: [{ command: "spoofed" }],
                    },
                },
                jsonOutput,
            );
            const payload = JSON.parse(spy.mock.calls[0]?.[0] as string);
            expect(payload).toMatchObject({
                id: "project_123",
                ok: true,
                action: "projects.create",
                entity: "project",
                ids: { projectId: "project_123" },
                changed: {},
                warnings: [],
                next: [],
            });
        } finally {
            spy.mockRestore();
        }
    });

    it("prints only the legacy data object in table mode", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            printReceipt(
                {
                    ok: true,
                    action: "clients.update",
                    entity: "client",
                    ids: { clientId: "client_123" },
                    changed: { updated: [{ type: "client", id: "client_123" }] },
                    data: { id: "client_123", name: "Acme" },
                    warnings: ["kept archived state"],
                    next: [{ command: "clockify115 clients get client_123" }],
                },
                tableOutput,
            );
            const output = spy.mock.calls[0]?.[0] as string;
            expect(output).toContain("Acme");
            expect(output).not.toContain("kept archived state");
        } finally {
            spy.mockRestore();
        }
    });
});
