/**
 * Wire-shape regression ledger — the executable mirror of the live-verified
 * Clockify quirks recorded in `spec/evidence/discrepancies.md` (the "Live-verified
 * money & wire-shape findings ported from the ai-assistant addon" section).
 *
 * Two jobs:
 *  1. Assert the WRAPPER-layer invariants directly (the pure money + invoice-body
 *     helpers that encode the two most dangerous, money-losing quirks).
 *  2. Ledger-coverage guard: parse the ported section of discrepancies.md and
 *     assert every COMPENSATED finding still maps to a test file that exists on
 *     disk. A new COMPENSATED finding added without coverage — or a covering test
 *     file that gets deleted — fails this gate, so the ledger can never drift back
 *     into un-enforced prose.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { invoiceUpdateBodyFromExisting } from "../invoice-body.js";
import { CLOCKIFY_AMOUNT_UNITS, invoiceItemUnitPriceToWire, toMinor } from "../money.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Every COMPENSATED / PARTIALLY COMPENSATED finding in the ported ledger section,
 * mapped to the test file(s) that lock it. Slugs MUST match the `### \`slug\``
 * headers in discrepancies.md exactly; the guard below proves the two sides agree.
 */
const LEDGER_COVERAGE: Record<string, readonly string[]> = {
    "invoices.update.replace-and-tax-discount-zeroing": [
        "wrapper/tests/invoice-body.test.ts",
        "wrapper/tests/wire-shape.test.ts",
        "wrapper/tests/wire-shape-http.test.ts",
    ],
    "invoices.create.note-subject-dropped": ["mcp/tests/invoices.test.ts", "wrapper/tests/wire-shape-http.test.ts"],
    "money.amount-units.expenses-major-invoices-minor": ["wrapper/tests/money.test.ts", "wrapper/tests/wire-shape.test.ts"],
    "holidays.update.replace-and-scope-filter": ["mcp/tests/holidays.test.ts", "mcp/tests/wire-shape.test.ts"],
    "time-off.policies.update.replace-and-scope-filter": ["mcp/tests/time-off-policies.test.ts", "mcp/tests/wire-shape.test.ts"],
    "time-off.policies.scope.status-active-not-all": ["mcp/tests/time-off-policies.test.ts", "mcp/tests/holidays.test.ts"],
    "rates.put-minor-units-no-get": ["mcp/tests/rates.test.ts"],
    "scheduling.project-totals.get-vs-post": ["mcp/tests/scheduling-totals.test.ts"],
    "scheduling.list-per-project.start-end-required-camel-pagesize": ["mcp/tests/scheduling-totals.test.ts"],
    "time-off.requests.update-status.wrong-method-and-field": ["mcp/tests/sweep-fixes.test.ts"],
    "deletes.archive-first": ["mcp/tests/sweep-fixes.test.ts"],
    "user-groups.get.returns-void": ["mcp/tests/groups-get.test.ts"],
    "time-off.requests.get.dead-route": ["mcp/tests/time-off-get.test.ts"],
    "deletes.archive-first.projects-tasks": ["mcp/tests/archive-then-delete.test.ts"],
    "deletes.archive-first.clients-blocked": ["mcp/tests/archive-then-delete.test.ts"],
};

/**
 * Extract `{ slug, compensated }` for every finding header in the ported section
 * of the ledger (everything after the "Live-verified money & wire-shape findings
 * ported" heading). `compensated` is true when the header line carries
 * COMPENSATED (incl. PARTIALLY COMPENSATED); OPEN findings are not yet required
 * to have coverage.
 */
function portedFindings(): Array<{ slug: string; compensated: boolean }> {
    const text = fs.readFileSync(path.join(repoRoot, "spec/evidence/discrepancies.md"), "utf8");
    const sectionStart = text.indexOf("Live-verified money & wire-shape findings ported");
    expect(sectionStart, "ported wire-shape ledger section must exist").toBeGreaterThan(-1);
    const section = text.slice(sectionStart);
    const findings: Array<{ slug: string; compensated: boolean }> = [];
    const headerRe = /^### `([^`]+)`\s*[—-]\s*(.*)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headerRe.exec(section)) !== null) {
        const rawSlug = match[1];
        const status = match[2] ?? "";
        if (!rawSlug) continue;
        // A header may pack two slugs separated by ` + ` (e.g. the OPEN
        // items-unit-price + payments finding); split so each is checked.
        for (const slug of rawSlug.split("+").map((s) => s.replace(/`/g, "").trim())) {
            if (slug) findings.push({ slug, compensated: /COMPENSATED/.test(status) });
        }
    }
    return findings;
}

describe("wire-shape ledger (wrapper helpers)", () => {
    it("invoice update: replaces the doc but preserves omitted editable fields", () => {
        const existing = {
            clientId: "c1",
            currency: "USD",
            note: "Net 30 terms",
            subject: "Website work",
            // read-only/computed fields the GET returns must NOT be carried back:
            amount: 999,
            balance: 999,
            status: "UNSENT",
        };
        const body = invoiceUpdateBodyFromExisting(existing, { dueDate: "2026-07-01" });
        // omitted-but-editable fields survive the replace
        expect(body.note).toBe("Net 30 terms");
        expect(body.subject).toBe("Website work");
        expect(body.dueDate).toBe("2026-07-01");
        // read-only/computed fields are dropped (a PUT rejects them)
        expect(body).not.toHaveProperty("amount");
        expect(body).not.toHaveProperty("balance");
        expect(body).not.toHaveProperty("status");
    });

    it("invoice update: maps GET tax/discount (×100 ints) to PUT *Percent (÷100), never verbatim", () => {
        const existing = { tax: 1000, discount: 500, tax2: 0 }; // 10% / 5% / 0% on the wire
        const body = invoiceUpdateBodyFromExisting(existing);
        expect(body.taxPercent).toBe(10);
        expect(body.discountPercent).toBe(5);
        expect(body.tax2Percent).toBe(0);
        // copying the GET names verbatim is the silent-zeroing bug — must not happen
        expect(body).not.toHaveProperty("tax");
        expect(body).not.toHaveProperty("discount");
        // an explicit *Percent in the patch overrides the carried-forward value
        expect(invoiceUpdateBodyFromExisting(existing, { taxPercent: 20 }).taxPercent).toBe(20);
    });

    it("money units: expenses are MAJOR, invoices/payments/rates are MINOR on the wire", () => {
        expect(CLOCKIFY_AMOUNT_UNITS.expense).toBe("major");
        expect(CLOCKIFY_AMOUNT_UNITS.invoice).toBe("minor");
        expect(CLOCKIFY_AMOUNT_UNITS.invoicePayment).toBe("minor");
        expect(CLOCKIFY_AMOUNT_UNITS.rate).toBe("minor");
        // a $100 expense (major) and a 10000-cent invoice amount (minor) both → 10000 minor
        expect(toMinor(100, CLOCKIFY_AMOUNT_UNITS.expense)).toBe(10000);
        expect(toMinor(10000, CLOCKIFY_AMOUNT_UNITS.invoice)).toBe(10000);
        // rounds AFTER ×100 so float dust never under-bills
        expect(toMinor(19.99, "major")).toBe(1999);
    });

    it("invoice item unitPrice is the third scale (minor×100), not plain minor", () => {
        // a $1000 item = 100000 minor → 10000000 on the item wire (sending plain minor billed $10)
        expect(invoiceItemUnitPriceToWire(100000)).toBe(10000000);
    });

    it("ledger coverage: every COMPENSATED finding maps to a test file that exists", () => {
        const findings = portedFindings();
        expect(findings.length).toBeGreaterThan(0);

        // 1. every COMPENSATED ledger slug has a coverage entry whose files exist
        for (const { slug, compensated } of findings) {
            if (!compensated) continue;
            const covers = LEDGER_COVERAGE[slug];
            expect(covers, `COMPENSATED finding \`${slug}\` has no test coverage in LEDGER_COVERAGE`).toBeTruthy();
            for (const rel of covers ?? []) {
                expect(fs.existsSync(path.join(repoRoot, rel)), `coverage file ${rel} for \`${slug}\` is missing`).toBe(true);
            }
        }

        // 2. no stale coverage entry: every mapped slug is a real COMPENSATED finding
        const compensatedSlugs = new Set(findings.filter((f) => f.compensated).map((f) => f.slug));
        for (const slug of Object.keys(LEDGER_COVERAGE)) {
            expect(compensatedSlugs.has(slug), `LEDGER_COVERAGE has \`${slug}\` but the ledger no longer marks it COMPENSATED`).toBe(true);
        }
    });
});
