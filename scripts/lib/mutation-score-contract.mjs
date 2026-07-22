import path from "node:path";

function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function isRepoRelativePath(value) {
    if (typeof value !== "string" || value.trim() === "" || path.isAbsolute(value)) return false;
    const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
    return normalized !== ".." && !normalized.startsWith("../");
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
export function validateMutationModuleFloorScope({ packageId, moduleFloors, mutate }) {
    const failures = [];
    const sourcePaths = new Set();

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
                if (!isRepoRelativePath(entry.slice(1))) {
                    failures.push(`${label}: exclusion must be a repo-relative path`);
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
        }
    }

    if (sourcePaths.size === 0) {
        failures.push(`${packageId}.mutate: must include at least one positive source path`);
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
