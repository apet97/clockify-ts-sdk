// Governed npm-audit exception evaluation. Pure logic so the checker and its
// tests share one implementation (mirrors scripts/lib/mutation-score.mjs).

const SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);
const SUPPORTED_AUDIT_REPORT_VERSIONS = new Set([2]);

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeDiagnosticText(value) {
    if (value === undefined || value === null) return "";
    return String(value)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(
            /((?:token|password|secret|authorization|_authToken)\s*[=:]\s*)[^\s]+/gi,
            "$1[redacted]",
        )
        .slice(0, 2_000);
}

/**
 * Validate the top-level shape emitted by `npm audit --json`.
 *
 * npm can return a parseable `{ error: ... }` object for registry and
 * transport failures. That is not an audit report and must never be treated
 * as an empty vulnerability set.
 */
export function validateAuditReport(report) {
    const failures = [];
    if (!isRecord(report)) {
        failures.push("report: top-level value must be a JSON object");
        return failures;
    }
    if (Object.hasOwn(report, "error")) {
        failures.push("report: npm returned an error envelope, not an audit report");
    }
    if (!SUPPORTED_AUDIT_REPORT_VERSIONS.has(report.auditReportVersion)) {
        failures.push(
            `report: auditReportVersion must be one of ${[...SUPPORTED_AUDIT_REPORT_VERSIONS].join(", ")}`,
        );
    }
    if (!isRecord(report.vulnerabilities)) {
        failures.push("report: vulnerabilities must be an object");
    }
    if (!isRecord(report.metadata)) {
        failures.push("report: metadata must be an object");
    } else if (!isRecord(report.metadata.vulnerabilities)) {
        failures.push("report: metadata.vulnerabilities must be an object");
    }
    return failures;
}

/** Parse and validate raw stdout from `npm audit --json`. */
export function parseAuditReport(stdout) {
    if (typeof stdout !== "string" || stdout.trim() === "") {
        return { report: null, failures: ["report: npm returned empty stdout"] };
    }
    let report;
    try {
        report = JSON.parse(stdout);
    } catch {
        return { report: null, failures: ["report: npm returned invalid JSON"] };
    }
    const failures = validateAuditReport(report);
    return { report: failures.length === 0 ? report : null, failures };
}

/**
 * Return safe process evidence for a governed audit command.
 * stdout is intentionally represented only by its byte count; stderr and
 * spawn errors are bounded and stripped of control characters/credential-like
 * values before they can enter a receipt or terminal log.
 */
export function auditCommandDiagnostics(result) {
    return {
        status: Number.isInteger(result?.status) ? result.status : null,
        signal: typeof result?.signal === "string" ? result.signal : null,
        stdoutBytes: typeof result?.stdout === "string" ? Buffer.byteLength(result.stdout) : 0,
        stderr: sanitizeDiagnosticText(result?.stderr),
        error: result?.error === undefined ? null : sanitizeDiagnosticText(result.error?.message ?? result.error),
    };
}

function advisoryIdFromUrl(url) {
    if (typeof url !== "string") return null;
    const match = url.match(/(GHSA-[a-z0-9-]+)\s*$/i);
    return match === null ? null : match[1];
}

/** Collect the distinct advisories (id, module, severity) an npm audit --json report observes. */
export function observedAdvisories(report) {
    const observed = new Map();
    for (const vulnerability of Object.values(report?.vulnerabilities ?? {})) {
        for (const via of vulnerability?.via ?? []) {
            if (typeof via !== "object" || via === null) continue;
            const id = advisoryIdFromUrl(via.url);
            const entry = {
                id,
                module: via.name ?? "unknown",
                severity: via.severity ?? "unknown",
                title: via.title ?? "",
            };
            // `advisoryIdFromUrl` returns a non-empty string or `null` (never
            // `undefined`), so the `??` picks the id key in exactly the cases an
            // explicit `id === null` branch would not. Advisories without a GHSA
            // id de-duplicate on module+title instead.
            observed.set(id ?? `unidentified:${entry.module}:${entry.title}`, entry);
        }
    }
    return [...observed.values()];
}

function validateRegisterShape(register, failures) {
    if (register?.schemaVersion !== 1) failures.push("register: schemaVersion must be 1");
    if (typeof register?.purpose !== "string" || register.purpose.trim() === "") {
        failures.push("register: purpose must be a non-empty string");
    }
    if (!Array.isArray(register?.exceptions)) {
        failures.push("register: exceptions must be an array");
        return [];
    }
    const seen = new Set();
    for (const [index, exception] of register.exceptions.entries()) {
        const label = `register.exceptions[${index}]`;
        for (const key of ["advisory", "module", "reason", "upstream", "recordedSeverity", "added", "expires"]) {
            if (typeof exception?.[key] !== "string" || exception[key].trim() === "") {
                failures.push(`${label}: ${key} must be a non-empty string`);
            }
        }
        if (typeof exception?.advisory === "string") {
            if (!/^GHSA-[a-z0-9-]+$/.test(exception.advisory)) {
                failures.push(`${label}: advisory must be a GHSA id`);
            }
            if (seen.has(exception.advisory)) failures.push(`${label}: duplicate advisory ${exception.advisory}`);
            seen.add(exception.advisory);
        }
        if (typeof exception?.recordedSeverity === "string" && !SEVERITIES.has(exception.recordedSeverity)) {
            failures.push(`${label}: recordedSeverity must be one of ${[...SEVERITIES].join(", ")}`);
        }
        for (const key of ["added", "expires"]) {
            if (typeof exception?.[key] === "string" && Number.isNaN(Date.parse(exception[key]))) {
                failures.push(`${label}: ${key} must be an ISO date`);
            }
        }
        if (
            typeof exception?.added === "string" &&
            typeof exception?.expires === "string" &&
            Date.parse(exception.added) > Date.parse(exception.expires)
        ) {
            failures.push(`${label}: added must not be after expires`);
        }
    }
    return register.exceptions;
}

/**
 * Evaluate an npm audit report against the exception register. Fails closed:
 * unexcepted, expired, severity-drifted, unidentifiable, and stale entries
 * are all failures. Returns { failures, observed }.
 */
export function evaluateAudit(report, register, now = new Date()) {
    const failures = validateAuditReport(report);
    if (failures.length > 0) return { failures, observed: [] };

    const exceptions = validateRegisterShape(register, failures);
    const observed = observedAdvisories(report);
    const byAdvisory = new Map(
        exceptions.filter((e) => typeof e?.advisory === "string").map((e) => [e.advisory, e]),
    );

    for (const advisory of observed) {
        if (advisory.id === null) {
            failures.push(
                `advisory without a GHSA id observed for ${advisory.module} (${advisory.title}); cannot be excepted`,
            );
            continue;
        }
        const exception = byAdvisory.get(advisory.id);
        if (exception === undefined) {
            failures.push(
                `unexcepted advisory ${advisory.id} (${advisory.module}, ${advisory.severity}); fix it or add a governed exception with justification and expiry`,
            );
            continue;
        }
        if (now.getTime() > Date.parse(exception.expires)) {
            failures.push(
                `exception for ${advisory.id} expired ${exception.expires}; re-review the upstream fix status before renewing`,
            );
        }
        if (advisory.severity !== exception.recordedSeverity) {
            failures.push(
                `advisory ${advisory.id} severity ${advisory.severity} != recorded ${exception.recordedSeverity}; re-review the exception`,
            );
        }
    }

    const observedIds = new Set(observed.map((a) => a.id).filter((id) => id !== null));
    for (const exception of exceptions) {
        if (typeof exception?.advisory === "string" && !observedIds.has(exception.advisory)) {
            failures.push(
                `stale exception ${exception.advisory}: advisory no longer reported; remove the exception`,
            );
        }
    }

    return { failures, observed };
}

/**
 * Evaluate one spawnSync-like `npm audit --json` result.
 *
 * Exit status 1 is valid when npm found advisories, so status alone is not a
 * failure. Spawn errors, signals, unsupported statuses, malformed/error
 * envelopes, and status/report contradictions all fail closed.
 */
export function evaluateAuditCommand(result, register, now = new Date()) {
    const diagnostics = auditCommandDiagnostics(result);
    const failures = [];
    if (result?.error !== undefined) failures.push("command: npm audit failed to start");
    if (diagnostics.signal !== null) failures.push(`command: npm audit was terminated by ${diagnostics.signal}`);
    if (diagnostics.status === null) failures.push("command: npm audit did not return an exit status");
    if (diagnostics.status !== null && ![0, 1].includes(diagnostics.status)) {
        failures.push(`command: npm audit exited with unsupported status ${diagnostics.status}`);
    }

    const parsed = parseAuditReport(result?.stdout);
    failures.push(...parsed.failures);
    if (failures.length > 0 || parsed.report === null) {
        return { failures, observed: [], report: null, diagnostics };
    }

    const evaluation = evaluateAudit(parsed.report, register, now);
    failures.push(...evaluation.failures);
    if (diagnostics.status === 0 && evaluation.observed.length > 0) {
        failures.push("command: npm audit exited 0 but the report contains advisories");
    }
    if (diagnostics.status === 1 && evaluation.observed.length === 0) {
        failures.push("command: npm audit exited 1 but the report contains no advisories");
    }
    return {
        failures,
        observed: evaluation.observed,
        report: parsed.report,
        diagnostics,
    };
}
