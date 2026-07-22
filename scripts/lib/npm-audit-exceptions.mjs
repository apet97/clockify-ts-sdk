// Governed npm-audit exception evaluation. Pure logic so the checker and its
// tests share one implementation (mirrors scripts/lib/mutation-score.mjs).

const SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

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
            if (id === null) {
                observed.set(`unidentified:${via.name ?? "unknown"}:${via.title ?? ""}`, {
                    id: null,
                    module: via.name ?? "unknown",
                    severity: via.severity ?? "unknown",
                    title: via.title ?? "",
                });
                continue;
            }
            observed.set(id, {
                id,
                module: via.name ?? "unknown",
                severity: via.severity ?? "unknown",
                title: via.title ?? "",
            });
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
    const failures = [];
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
