import fs from "node:fs";
import path from "node:path";

const normalize = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
const object = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const safePath = (value) => typeof value === "string" && value.trim() !== "" && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes("..") && !path.normalize(value).startsWith("..");

export function validateUniqueClaimInventory({ root, policy, inventory, files }) {
    const failures = [];
    const read = (relative) => {
        if (!safePath(relative)) return null;
        if (files && Object.hasOwn(files, relative)) return files[relative];
        const absolute = path.join(root, relative);
        return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
    };
    const fail = (message) => failures.push(message);
    if (!object(policy) || !Array.isArray(policy.claimUniverse) || policy.claimUniverse.length === 0) fail("policy must declare a non-empty claim universe");
    if (!object(inventory) || inventory.schemaVersion !== 1 || !Array.isArray(inventory.claims) || inventory.claims.length === 0) return [...failures, "inventory must contain non-empty schemaVersion 1 claims"];
    const keys = new Set(); const ids = new Set(); const locations = new Map();
    for (const [index, row] of inventory.claims.entries()) {
        const label = `claims[${index}]`;
        if (!object(row)) { fail(`${label} must be an object`); continue; }
        for (const field of ["id", "claimKey", "claim", "kind", "boundary", "status", "sourceOfTruth"]) if (normalize(row[field]) === "") fail(`${label}.${field} must be non-empty`);
        const key = normalize(row.claimKey); if (keys.has(key)) fail(`${label} duplicate normalized claimKey ${JSON.stringify(key)}`); keys.add(key);
        const id = normalize(row.id); if (ids.has(id)) fail(`${label} duplicate id ${JSON.stringify(id)}`); ids.add(id);
        if (!policy.allowedKinds?.includes(row.kind)) fail(`${label} has unknown kind ${JSON.stringify(row.kind)}`);
        if (!policy.allowedStatuses?.includes(row.status)) fail(`${label} has unknown or complete-sounding status ${JSON.stringify(row.status)}`);
        if (!policy.claimUniverse?.includes(row.kind)) fail(`${label} is outside declared canonical universe`);
        if (!safePath(row.sourceOfTruth) || read(row.sourceOfTruth) == null) fail(`${label}.sourceOfTruth must be an existing safe path`);
        for (const field of ["locations", "evidence"]) if (!Array.isArray(row[field]) || row[field].length === 0) fail(`${label}.${field} must be non-empty`);
        const rowLocations = new Set();
        for (const location of row.locations ?? []) {
            const signature = `${location?.path}#${location?.marker}`;
            if (rowLocations.has(signature)) fail(`${label} duplicate location`); rowLocations.add(signature);
            if (!safePath(location?.path)) { fail(`${label} location unsafe path`); continue; }
            const text = read(location.path); if (text == null) fail(`${label} location missing ${location.path}`); else if (normalize(location.marker) === "" || !text.includes(location.marker)) fail(`${label} location is unanchored`);
            const prior = locations.get(signature); const provenance = JSON.stringify([row.evidence, row.sourceOfTruth, row.status, row.boundary]);
            if (prior && prior !== provenance) fail(`${label} conflicting canonical location ${signature}`); else locations.set(signature, provenance);
        }
        for (const evidence of row.evidence ?? []) {
            if (!safePath(evidence?.path)) { fail(`${label} evidence unsafe path`); continue; }
            const text = read(evidence.path); if (text == null || normalize(evidence.marker) === "" || !text.includes(evidence.marker)) fail(`${label} evidence missing or unanchored`);
            if (evidence.path === "Makefile" && !new RegExp(`^${evidence.marker.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:`, "m").test(text)) fail(`${label} evidence names made-up Make target`);
        }
        if (row.kind === "workflow") {
            const product = read(policy.workflowBacking?.path);
            let surface; try { surface = JSON.parse(product); } catch { surface = null; }
            const workflowId = row.workflowId;
            const workflow = surface?.workflows?.find((candidate) => candidate.id === workflowId);
            if (!workflow) fail(`${label} workflow backing missing product-surface workflow`);
            for (const field of policy.workflowBacking?.requiredFields ?? []) if (!workflow || (Array.isArray(workflow[field]) ? (field !== "intentionalGaps" && workflow[field].length === 0) : !object(workflow[field]) && normalize(workflow[field]) === "")) fail(`${label} workflow backing missing required field ${field}`);
        }
    }
    return failures;
}
