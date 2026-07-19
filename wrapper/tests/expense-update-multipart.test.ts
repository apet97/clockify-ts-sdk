import { describe, expect, it, vi } from "vitest";

import { ClockifyApiClient } from "../index.js";

type CapturedPart = readonly [string, FormDataEntryValue];

function expenseClient(parts: CapturedPart[]) {
    const dispatch = vi.fn<typeof fetch>(async (input, init) => {
        const request = input instanceof Request && init === undefined ? input : new Request(input, init);
        expect(request.method).toBe("PUT");
        expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
        const body = await request.formData();
        parts.push(...body.entries());
        return new Response(JSON.stringify({ id: "expense-1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });
    return new ClockifyApiClient({ apiKey: "test", fetch: dispatch, maxRetries: 0 });
}

describe("generated expense update multipart", () => {
    it("accepts a typed scalar update and emits no file part", async () => {
        const parts: CapturedPart[] = [];
        const client = expenseClient(parts);

        await client.expenses.update({
            workspaceId: "workspace-1",
            expenseId: "expense-1",
            amount: 12.5,
            categoryId: "category-1",
            changeFields: ["AMOUNT", "NOTES"],
            date: "2026-07-19T00:00:00Z",
            notes: "Taxi",
            userId: "user-1",
        });

        expect(parts).toEqual([
            ["amount", "12.5"],
            ["categoryId", "category-1"],
            ["changeFields", "AMOUNT"],
            ["changeFields", "NOTES"],
            ["date", "2026-07-19T00:00:00Z"],
            ["notes", "Taxi"],
            ["userId", "user-1"],
        ]);
        expect(parts.some(([name]) => name === "file")).toBe(false);
    });

    it("preserves the optional binary file as exactly one file part", async () => {
        const parts: CapturedPart[] = [];
        const client = expenseClient(parts);
        const receipt = new Blob(["png-receipt"], { type: "image/png" });

        await client.expenses.update({
            workspaceId: "workspace-1",
            expenseId: "expense-1",
            amount: 12.5,
            categoryId: "category-1",
            changeFields: ["AMOUNT", "FILE"],
            date: "2026-07-19T00:00:00Z",
            file: receipt,
            userId: "user-1",
        });

        expect(parts.map(([name]) => name)).toEqual([
            "amount",
            "categoryId",
            "changeFields",
            "changeFields",
            "date",
            "file",
            "userId",
        ]);
        const fileParts = parts.filter(([name]) => name === "file");
        expect(fileParts).toHaveLength(1);
        const file = fileParts[0]?.[1];
        expect(file).toBeInstanceOf(Blob);
        expect((file as Blob).type).toBe("image/png");
        expect(await (file as Blob).text()).toBe("png-receipt");
    });
});
