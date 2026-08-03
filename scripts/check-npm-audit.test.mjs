import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    evaluateAudit,
    evaluateAuditCommand,
    observedAdvisories,
} from "./lib/npm-audit-exceptions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOW = new Date("2026-07-22T00:00:00Z");

function report(vulnerabilities) {
    return {
        auditReportVersion: 2,
        vulnerabilities,
        metadata: { vulnerabilities: {} },
    };
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

function commandResult(stdout, overrides = {}) {
    return {
        status: 0,
        signal: null,
        error: undefined,
        stdout: JSON.stringify(stdout),
        stderr: "",
        ...overrides,
    };
}

test("a valid advisory report with npm's normal exit 1 reaches advisory evaluation", () => {
    const result = evaluateAuditCommand(
        commandResult(honoAdvisoryReport(), { status: 1 }),
        exceptionRegister(),
        NOW,
    );
    assert.deepEqual(result.failures, []);
    assert.equal(result.observed.length, 1);
});

test("a parseable npm error envelope fails closed", () => {
    const result = evaluateAuditCommand(
        commandResult({ error: { code: "E404", summary: "Not Found" } }, { status: 1 }),
        { schemaVersion: 1, purpose: "x", exceptions: [] },
        NOW,
    );
    assert.ok(result.failures.some((failure) => /error envelope/.test(failure)));
    assert.deepEqual(result.observed, []);
});

test("missing audit fields fail closed", () => {
    for (const fixture of [
        { vulnerabilities: {}, metadata: { vulnerabilities: {} } },
        { auditReportVersion: 2, metadata: { vulnerabilities: {} } },
        { auditReportVersion: 2, vulnerabilities: {} },
        { auditReportVersion: 99, vulnerabilities: {}, metadata: { vulnerabilities: {} } },
    ]) {
        const result = evaluateAuditCommand(
            commandResult(fixture),
            { schemaVersion: 1, purpose: "x", exceptions: [] },
            NOW,
        );
        assert.ok(result.failures.length > 0, JSON.stringify(fixture));
    }
});

test("empty and invalid stdout fail closed", () => {
    for (const stdout of ["", "not json"]) {
        const result = evaluateAuditCommand(
            commandResult({}, { stdout }),
            { schemaVersion: 1, purpose: "x", exceptions: [] },
            NOW,
        );
        assert.ok(result.failures.length > 0, JSON.stringify({ stdout }));
    }
});

test("spawn errors and signals fail closed with bounded diagnostics", () => {
    const spawnFailure = evaluateAuditCommand(
        commandResult({}, { status: null, error: new Error("spawn failed with token=secret") }),
        { schemaVersion: 1, purpose: "x", exceptions: [] },
        NOW,
    );
    assert.ok(spawnFailure.failures.some((failure) => /failed to start/.test(failure)));
    assert.equal(spawnFailure.diagnostics.error, "spawn failed with token=[redacted]");

    const signaled = evaluateAuditCommand(
        commandResult({}, { status: null, signal: "SIGTERM" }),
        { schemaVersion: 1, purpose: "x", exceptions: [] },
        NOW,
    );
    assert.ok(signaled.failures.some((failure) => /terminated by SIGTERM/.test(failure)));
});

test("unsupported command statuses fail closed", () => {
    const result = evaluateAuditCommand(
        commandResult(report({}), { status: 2 }),
        { schemaVersion: 1, purpose: "x", exceptions: [] },
        NOW,
    );
    assert.ok(result.failures.some((failure) => /unsupported status 2/.test(failure)));
});

test("command and report status contradictions fail closed", () => {
    const clean = evaluateAuditCommand(
        commandResult(report({}), { status: 1 }),
        { schemaVersion: 1, purpose: "x", exceptions: [] },
        NOW,
    );
    assert.ok(clean.failures.some((failure) => /exited 1 but the report contains no advisories/.test(failure)));

    const advisory = evaluateAuditCommand(
        commandResult(honoAdvisoryReport(), { status: 0 }),
        exceptionRegister(),
        NOW,
    );
    assert.ok(advisory.failures.some((failure) => /exited 0 but the report contains advisories/.test(failure)));
});
