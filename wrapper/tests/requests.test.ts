import { describe, expect, it } from "vitest";

import {
    AUDIT_LOG_ACTIONS,
    type AuditLogAction,
    type ClockifyApi,
    type ClockifyRequestBody,
} from "../requests.js";

describe("request type exports", () => {
    it("extracts the body-envelope arm for incremental request builders", () => {
        const body = {
            name: "Acme",
            note: "preferred",
        } satisfies ClockifyRequestBody<ClockifyApi.ClientCreate>;

        expect(body).toEqual({ name: "Acme", note: "preferred" });
    });

    it("keeps the audit action value and type exports aligned", () => {
        const action: AuditLogAction = AUDIT_LOG_ACTIONS[0];

        expect(AUDIT_LOG_ACTIONS).toContain(action);
    });
});
