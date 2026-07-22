import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateAudit, observedAdvisories } from "./lib/npm-audit-exceptions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = new Date("2026-07-22T00:00:00Z");

function report(vulnerabilities) {
    return { auditReportVersion: 2, vulnerabilities };
}

function honoAdvisoryReport(severity = "moderate") {
    return report({
        "@hono/node-server": {
            name: "@hono/node-server",
            severity,
            via: [
                {
                    name: "@hono/node-server",
                    title: "Path traversal in serve-static",
                    url: "https://github.com/advisories/GHSA-frvp-7c67-39w9",
                    severity,
                    range: "<2.0.5",
                },
            ],
        },
        "@modelcontextprotocol/sdk": {
            name: "@modelcontextprotocol/sdk",
            severity,
            via: ["@hono/node-server"],
        },
    });
}

function exceptionRegister(overrides = {}) {
    return {
        schemaVersion: 1,
        purpose: "test register",
        exceptions: [
            {
                advisory: "GHSA-frvp-7c67-39w9",
                module: "@hono/node-server",
                recordedSeverity: "moderate",
                reason: "unreachable code path",
                upstream: "https://github.com/advisories/GHSA-frvp-7c67-39w9",
                added: "2026-07-22",
                expires: "2026-10-20",
                ...overrides,
            },
        ],
    };
}

test("clean report with empty register passes", () => {
    const { failures } = evaluateAudit(report({}), { schemaVersion: 1, purpose: "x", exceptions: [] }, NOW);
    assert.deepEqual(failures, []);
});

test("chained dependents do not need their own exception", () => {
    const { failures, observed } = evaluateAudit(honoAdvisoryReport(), exceptionRegister(), NOW);
    assert.deepEqual(failures, []);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].id, "GHSA-frvp-7c67-39w9");
});

test("unexcepted advisory fails closed", () => {
    const { failures } = evaluateAudit(
        honoAdvisoryReport(),
        { schemaVersion: 1, purpose: "x", exceptions: [] },
        NOW,
    );
    assert.equal(failures.length, 1);
    assert.match(failures[0], /unexcepted advisory GHSA-frvp-7c67-39w9/);
});

test("expired exception fails closed", () => {
    const { failures } = evaluateAudit(
        honoAdvisoryReport(),
        exceptionRegister({ added: "2026-06-01", expires: "2026-07-01" }),
        NOW,
    );
    assert.equal(failures.length, 1);
    assert.match(failures[0], /expired 2026-07-01/);
});

test("severity drift fails closed", () => {
    const { failures } = evaluateAudit(honoAdvisoryReport("high"), exceptionRegister(), NOW);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /severity high != recorded moderate/);
});

test("stale exception fails closed once the advisory disappears", () => {
    const { failures } = evaluateAudit(report({}), exceptionRegister(), NOW);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /stale exception GHSA-frvp-7c67-39w9/);
});

test("advisory without a GHSA id fails closed", () => {
    const malformed = report({
        thing: { name: "thing", severity: "low", via: [{ name: "thing", title: "t", url: "https://example.com/x" }] },
    });
    const { failures } = evaluateAudit(malformed, { schemaVersion: 1, purpose: "x", exceptions: [] }, NOW);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /without a GHSA id/);
});

test("register shape violations fail closed", () => {
    const { failures } = evaluateAudit(report({}), {
        schemaVersion: 1,
        purpose: "x",
        exceptions: [{ advisory: "GHSA-abcd-efgh-ijkl", module: "m" }],
    }, NOW);
    assert.ok(failures.some((f) => /reason must be a non-empty string/.test(f)));
    assert.ok(failures.some((f) => /expires must be a non-empty string/.test(f)));
});

test("the committed register matches the checker's expectations", () => {
    const register = JSON.parse(
        readFileSync(path.join(root, "docs", "npm-audit-exceptions.json"), "utf8"),
    );
    assert.equal(register.schemaVersion, 1);
    for (const exception of register.exceptions) {
        assert.match(exception.advisory, /^GHSA-/);
        assert.ok(Date.parse(exception.expires) > Date.parse(exception.added));
        assert.ok(exception.reason.length > 40, "reason must justify, not gesture");
        assert.ok(exception.upstream.includes("https://"));
    }
});

test("observedAdvisories dedupes repeated advisories across nodes", () => {
    const twice = report({
        a: { name: "a", severity: "low", via: [{ name: "a", title: "t", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "low" }] },
        b: { name: "b", severity: "low", via: [{ name: "a", title: "t", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "low" }] },
    });
    assert.equal(observedAdvisories(twice).length, 1);
});
