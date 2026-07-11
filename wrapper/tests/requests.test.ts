import { describe, expect, it } from "vitest";

import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "../requests.js";

describe("wireBody", () => {
    it("returns the same non-null object for generated request envelopes", () => {
        const body = { name: "Acme", note: "typed seam" };

        expect(wireBody(body)).toBe(body);
    });

    it("acts as an explicit typed seam for validated object records", () => {
        const request = {
            workspaceId: "workspace-1",
            body: { name: "Acme" },
        } satisfies { workspaceId: string; body: { name: string } };
        const typed = wireBody<{ workspaceId: string; body: { name: string } }>(request);

        expect(typed.body.name).toBe("Acme");
    });

    it("extracts the body-envelope arm for incremental request builders", () => {
        const body = {
            name: "Acme",
            note: "preferred",
        } satisfies ClockifyRequestBody<ClockifyApi.ClientCreate>;

        expect(body).toEqual({ name: "Acme", note: "preferred" });
    });

    it("rejects non-object values", () => {
        expect(() => wireBody(null as unknown as object)).toThrow(/non-null object/);
        expect(() => wireBody("name" as unknown as object)).toThrow(/non-null object/);
    });
});
