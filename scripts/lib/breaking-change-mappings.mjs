export const REQUIRED_BREAKING_CHANGE_MAPPINGS = Object.freeze([
    Object.freeze({
        removed: "allowInsecureBaseUrl",
        replacement: "allowNonClockifyHttpsHost",
    }),
    Object.freeze({ removed: "findOrCreateClient", replacement: "ensureClient" }),
    Object.freeze({
        removed: "ArchiveThenDeleteResource",
        replacement: "ArchiveThenDeleteAdapter<TCurrent>",
    }),
]);

export function validateRequiredBreakingChanges(value) {
    if (!Array.isArray(value)) return ["breakingChanges must be an array"];

    const failures = [];
    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
            failures.push(`breakingChanges[${index}] must be an object`);
            continue;
        }
        if (typeof entry.removed !== "string" || entry.removed.trim() === "") {
            failures.push(`breakingChanges[${index}].removed must be a non-empty string`);
            continue;
        }
        if (seen.has(entry.removed)) failures.push(`duplicate removed symbol ${entry.removed}`);
        seen.add(entry.removed);
    }

    for (const required of REQUIRED_BREAKING_CHANGE_MAPPINGS) {
        const entry = value.find((candidate) => candidate?.removed === required.removed);
        if (entry == null) {
            failures.push(`missing removed symbol ${required.removed}`);
            continue;
        }
        if (entry.replacement !== required.replacement) {
            failures.push(
                `${required.removed} replacement must be exactly ${required.replacement}`,
            );
        }
    }

    const requiredNames = new Set(REQUIRED_BREAKING_CHANGE_MAPPINGS.map(({ removed }) => removed));
    for (const entry of value) {
        if (typeof entry?.removed === "string" && !requiredNames.has(entry.removed)) {
            failures.push(`unexpected removed symbol ${entry.removed}`);
        }
    }

    return failures;
}
