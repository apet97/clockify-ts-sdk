import path from "node:path";

function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function isRepoRelativePath(value) {
    if (typeof value !== "string" || value.trim() === "" || path.isAbsolute(value)) return false;
    const slashPath = value.replaceAll("\\", "/");
    const normalized = path.posix.normalize(slashPath);
    return (
        normalized === slashPath &&
        normalized !== "." &&
        normalized !== ".." &&
        !normalized.startsWith("../")
    );
}

function isSourcePath(packageId, value) {
    if (!isRepoRelativePath(value) || value.includes("*") || value.includes("?") || value.includes("[")) {
        return false;
    }
    if (!value.startsWith(`${packageId}/`) || !value.endsWith(".ts")) return false;
    return !(
        value.includes("/dist/") ||
        value.includes("/tests/") ||
        value.endsWith(".test.ts") ||
        value.endsWith(".spec.ts") ||
        value.includes(".config.")
    );
}

/**
 * Require an exact one-to-one mapping between positive Stryker mutation
 * sources and the floor-bearing hand-written modules. Exclusions remain in
 * Stryker config but cannot silently become a governed module floor.
 */
export function validateMutationModuleFloorScope({ packageId, moduleFloors, mutate, sourceExists }) {
    const failures = [];
    const sourcePaths = new Set();
    const exclusions = [];
    const canVerifySources = typeof sourceExists === "function";
    if (!canVerifySources) {
        failures.push(`${packageId}.sourceExists: must provide a repo-backed source existence check`);
    }

    if (!Array.isArray(mutate) || mutate.length === 0) {
        failures.push(`${packageId}.mutate: must be a non-empty array`);
    } else {
        for (const [index, entry] of mutate.entries()) {
            const label = `${packageId}.mutate[${index}]`;
            if (typeof entry !== "string" || entry.trim() === "") {
                failures.push(`${label}: must be a non-empty source path or exclusion entry`);
                continue;
            }
            if (entry.startsWith("!")) {
                const exclusion = entry.slice(1);
                if (!isRepoRelativePath(exclusion)) {
                    failures.push(`${label}: exclusion must be a repo-relative path`);
                } else if (!exclusion.startsWith(`${packageId}/`)) {
                    failures.push(`${label}: exclusion must stay within ${packageId}/`);
                } else {
                    exclusions.push({ label, pattern: exclusion });
                }
                continue;
            }
            if (!isSourcePath(packageId, entry)) {
                failures.push(`${label}: must be a repo-relative hand-written TypeScript source path`);
                continue;
            }
            if (sourcePaths.has(entry)) {
                failures.push(`${label}: duplicate positive source path ${entry}`);
                continue;
            }
            sourcePaths.add(entry);
            if (canVerifySources && !sourceExists(entry)) {
                failures.push(`${label}: source path ${entry} does not exist as a file`);
            }
        }
    }

    if (sourcePaths.size === 0) {
        failures.push(`${packageId}.mutate: must include at least one positive source path`);
    }
    for (const { label, pattern } of exclusions) {
        for (const sourcePath of [...sourcePaths].sort()) {
            let overlaps = false;
            try {
                overlaps = path.matchesGlob(sourcePath, pattern);
            } catch {
                failures.push(`${label}: exclusion ${pattern} must be a valid glob path`);
                break;
            }
            if (overlaps) {
                failures.push(
                    `${label}: exclusion ${pattern} overlaps governed positive source ${sourcePath}`,
                );
            }
        }
    }

    if (!isPlainObject(moduleFloors)) {
        failures.push(`${packageId}.moduleFloors: must be a non-empty object`);
        return failures;
    }

    const floorPaths = Object.keys(moduleFloors);
    if (floorPaths.length === 0) {
        failures.push(`${packageId}.moduleFloors: must include at least one source path`);
    }
    for (const filePath of floorPaths) {
        if (!isSourcePath(packageId, filePath)) {
            failures.push(
                `${packageId}.moduleFloors: floor path ${filePath} must be a repo-relative hand-written TypeScript source path`,
            );
            continue;
        }
        if (canVerifySources && !sourceExists(filePath)) {
            failures.push(
                `${packageId}.moduleFloors: source path ${filePath} does not exist as a file`,
            );
        }
        if (!sourcePaths.has(filePath)) {
            failures.push(
                `${packageId}.moduleFloors: floor path ${filePath} is not an active mutate source`,
            );
        }
    }
    for (const filePath of [...sourcePaths].sort()) {
        if (!Object.hasOwn(moduleFloors, filePath)) {
            failures.push(`${packageId}.moduleFloors: missing active mutate source ${filePath}`);
        }
    }

    return failures;
}
