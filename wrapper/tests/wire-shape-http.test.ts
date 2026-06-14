/**
 * Wire-shape regression at the HTTP boundary. Proves the pure invoice-body
 * helper plus the generated SDK `invoices` resource send the CORRECT wire bytes
 * end-to-end against a mock that reproduces the live Clockify quirks:
 *
 *  - GET returns tax/discount as ×100 integers; the PUT must carry them as
 *    `taxPercent`/`discountPercent` (÷100), NEVER the verbatim GET names (which
 *    would silently zero them — "the big one").
 *  - PUT replaces the document, so omitted editable fields (note/subject) must be
 *    carried forward.
 *  - POST drops note/subject (echoes the workspace placeholder).
 *
 * Unlike the pure-helper unit tests, this drives the actual `core.request` HTTP
 * path + the generated `bodyFromRequest` field whitelist, catching a regression
 * where the SDK update method stops forwarding a percent/preserved field.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMockClockifyServer, type MockClockifyServer } from "../../scripts/mock-clockify-server.mjs";
import { createClockifyClient } from "../create-client.js";
import { invoiceUpdateBodyFromExisting } from "../invoice-body.js";

let mock: MockClockifyServer;
let baseUrl: string;

const INVOICE_ID = "000000000000000000000401";

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
});

afterEach(async () => {
    await mock.close();
});

function client() {
    return createClockifyClient({ apiKey: "mock", environment: baseUrl, maxRetries: 0 });
}

describe("wire-shape over HTTP (invoice tax/discount + replace)", () => {
    it("GET returns ×100 tax/discount; the helper+PUT send *Percent, never verbatim", async () => {
        const c = client();

        const existing = (await c.invoices.get({
            workspaceId: mock.workspaceId,
            invoiceId: INVOICE_ID,
        })) as unknown as Record<string, unknown>;
        // GET echoes the ×100-scaled wire values
        expect(existing.tax).toBe(1000);
        expect(existing.discount).toBe(500);

        const body = invoiceUpdateBodyFromExisting(existing, { dueDate: "2026-07-01" });
        await c.invoices.update({
            workspaceId: mock.workspaceId,
            invoiceId: INVOICE_ID,
            ...body,
        } as unknown as Parameters<typeof c.invoices.update>[0]);

        const sent = mock.state.lastInvoicePut as Record<string, unknown>;
        expect(sent).toBeTruthy();
        // mapped name + scale ÷100
        expect(sent.taxPercent).toBe(10);
        expect(sent.discountPercent).toBe(5);
        // the verbatim GET names must NOT be on the wire (silent-zeroing bug)
        expect(sent).not.toHaveProperty("tax");
        expect(sent).not.toHaveProperty("discount");
        // replace-PUT carried the omitted editable fields forward
        expect(sent.note).toBe("Net 30 terms");
        expect(sent.subject).toBe("Website redesign");
        expect(sent.dueDate).toBe("2026-07-01");
    });

    it("POST create drops note/subject (echoes the workspace placeholder)", async () => {
        const c = client();

        const created = (await c.invoices.create({
            workspaceId: mock.workspaceId,
            clientId: "000000000000000000000201",
            currency: "USD",
            note: "Please pay promptly",
            subject: "Q3 retainer",
        } as unknown as Parameters<typeof c.invoices.create>[0])) as unknown as Record<string, unknown>;

        // the supplied note/subject were silently dropped server-side
        expect(created.note).toBe("INPUT BILL INFO HERE");
        expect(created.subject).toBe("INPUT BILL INFO HERE");
    });
});
