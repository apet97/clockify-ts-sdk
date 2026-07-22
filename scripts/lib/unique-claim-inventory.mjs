import fs from "node:fs";
import path from "node:path";

const RECEIPT_ROOT = "docs/roadmap-1.0-receipts/";
const ARCHIVED_PLAN_ROOT = "docs/superpowers/plans/";
const EVIDENCE_TYPES = new Set(["make-target", "contract", "generated-surface", "receipt"]);

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const normalizeText = (value) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (!isObject(value)) return value;
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, stable(nested)]),
    );
};
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const sortedUnique = (values) => [...new Set(values)].sort();
const sameSet = (left, right) => same(sortedUnique(left), sortedUnique(right));

function canonicalPath(value) {
    if (typeof value !== "string" || value.trim() === "") return null;
    const raw = value.trim().replaceAll("\\", "/");
    if (path.posix.isAbsolute(raw) || path.win32.isAbsolute(value)) return null;
    if (raw.split("/").includes("..")) return null;
    const normalized = path.posix.normalize(raw).replace(/^\.\//, "");
    if (normalized === "." || normalized.startsWith("../")) return null;
    return normalized;
}

function forbiddenSource(relative) {
    const lower = relative.toLowerCase();
    if (lower.startsWith(RECEIPT_ROOT)) return "receipt";
    if (
        lower.startsWith(ARCHIVED_PLAN_ROOT) ||
        /(^|\/)(?:archive|archived|historical)(?:\/|$)/u.test(lower)
    ) {
        return "archived";
    }
    return null;
}

function makeReader(root, files) {
    const virtual = new Map();
    for (const [relative, contents] of Object.entries(files ?? {})) {
        const canonical = canonicalPath(relative);
        if (canonical) virtual.set(canonical, contents);
    }
    return (relative) => {
        const canonical = canonicalPath(relative);
        if (!canonical) return null;
        if (virtual.has(canonical)) return virtual.get(canonical);
        const absoluteRoot = path.resolve(root);
        const absolute = path.resolve(absoluteRoot, canonical);
        if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) return null;
        return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
    };
}

function parseJson(text, label, fail) {
    if (typeof text !== "string") {
        fail(`${label} does not exist`);
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${label} is malformed JSON: ${error.message}`);
        return null;
    }
}

function parseMakefile(text) {
    const targets = new Map();
    const lines = typeof text === "string" ? text.split("\n") : [];
    let current = [];
    for (const line of lines) {
        if (line.startsWith("\t")) {
            for (const target of current) targets.get(target).recipes.push(line.trim());
            continue;
        }
        current = [];
        const match = line.match(/^([A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+)*)\s*:(?![=])\s*(.*)$/u);
        if (!match || match[1] === ".PHONY") continue;
        current = match[1].split(/\s+/u);
        const dependencies = match[2].split(/\s+/u).filter(Boolean);
        for (const target of current) targets.set(target, { dependencies, recipes: [] });
    }
    return targets;
}

function roadmapState(value) {
    const normalized = normalizeText(value);
    if (normalized.startsWith("complete")) return "complete";
    if (normalized.startsWith("evidence_captured")) return "evidence_captured";
    if (normalized.startsWith("implemented")) return "implemented";
    if (normalized.startsWith("pending")) return "pending";
    return null;
}

function parseRoadmap(text, fail) {
    const rows = [];
    for (const line of typeof text === "string" ? text.split("\n") : []) {
        if (!line.startsWith("|")) continue;
        const cells = line
            .slice(1, line.endsWith("|") ? -1 : undefined)
            .split("|")
            .map((cell) => cell.trim());
        const taskMatch = cells[0]?.match(/^(\d+)\.\s+(.+)$/u);
        if (!taskMatch) continue;
        if (cells.length !== 6) {
            fail(`roadmap task ${taskMatch[1]} must have six table cells`);
            continue;
        }
        const taskNumber = Number(taskMatch[1]);
        const dependencyText = cells[1];
        const dependsOn = /^[—-]$/u.test(dependencyText)
            ? []
            : dependencyText
                  .split(",")
                  .map((value) => Number(value.trim().match(/^\d+/u)?.[0]))
                  .filter(Number.isInteger);
        const state = roadmapState(cells[2]);
        if (!state) fail(`roadmap task ${taskNumber} has unsupported state ${JSON.stringify(cells[2])}`);
        rows.push({
            sourceKey: `roadmap:task-${String(taskNumber).padStart(2, "0")}`,
            taskNumber,
            title: taskMatch[2],
            dependsOn,
            stateText: cells[2],
            state,
            closure: cells[4],
            releaseBlocking: /^yes\b/iu.test(cells[5]),
        });
    }
    const numbers = rows.map((row) => row.taskNumber);
    if (new Set(numbers).size !== numbers.length) fail("roadmap contains duplicate task numbers");
    return rows;
}

function riskProjection(risk) {
    return {
        id: risk.id,
        status: risk.status,
        finalReadinessBlocking: risk.finalReadinessBlocking === true,
        surface: risk.surface,
        summary: risk.summary,
        impact: risk.impact,
        mitigation: risk.mitigation,
        closureGate: risk.closureGate,
    };
}

function workflowProjection(workflow) {
    return {
        id: workflow.id,
        userGoal: workflow.userGoal,
        surfaceAvailability: workflow.surfaceAvailability,
        proof: workflow.proof,
        proofMode: workflow.proofMode,
        recovery: workflow.recovery,
        intentionalGaps: workflow.intentionalGaps,
    };
}

function sourceCoverage(fail, label, expected, actual) {
    if (!sameSet(expected, actual)) {
        fail(
            `${label} mismatch: expected ${JSON.stringify(sortedUnique(expected))}; got ${JSON.stringify(sortedUnique(actual))}`,
        );
    }
}

export function validateUniqueClaimInventory({ root, policy, inventory, files }) {
    const failures = [];
    const fail = (message) => failures.push(message);
    const read = makeReader(root, files);

    if (!isObject(policy)) {
        fail("policy must be an object");
        return failures;
    }
    if (!Array.isArray(policy.claimUniverse) || policy.claimUniverse.length === 0) {
        fail("policy must declare a non-empty claim universe");
    }
    if (!isObject(inventory) || inventory.schemaVersion !== 1 || !Array.isArray(inventory.claims)) {
        fail("inventory must use schemaVersion 1 and contain a claims array");
        return failures;
    }
    if (inventory.claims.length === 0) fail("inventory must contain claims");

    const makefilePath = canonicalPath(policy.wiring?.makefile ?? "Makefile");
    const makefile = makefilePath ? read(makefilePath) : null;
    const makeTargets = parseMakefile(makefile);
    const target = policy.wiring?.target;
    const aggregateTarget = policy.wiring?.aggregateTarget;
    const checker = policy.wiring?.checker;
    if (!makeTargets.has(target)) fail(`missing ${target ?? "unique-claim-inventory"} Make target`);
    if (
        makeTargets.has(target) &&
        !makeTargets.get(target).recipes.some((recipe) => recipe === `node ${checker}`)
    ) {
        fail("missing unique-claim checker invocation");
    }
    if (
        !makeTargets.has(aggregateTarget) ||
        !makeTargets.get(aggregateTarget).dependencies.includes(target)
    ) {
        fail(`${aggregateTarget ?? "docs-quality"} must depend on ${target ?? "unique-claim-inventory"}`);
    }

    const claims = inventory.claims;
    const ids = new Set();
    const claimKeys = new Set();
    const sourceKeys = new Set();
    const canonicalLocations = new Map();
    for (const [index, row] of claims.entries()) {
        const label = `claims[${index}]`;
        if (!isObject(row)) {
            fail(`${label} must be an object`);
            continue;
        }
        for (const field of [
            "id",
            "claimKey",
            "sourceKey",
            "claim",
            "kind",
            "boundary",
            "status",
            "sourceOfTruth",
        ]) {
            if (normalizeText(row[field]) === "") fail(`${label}.${field} must be non-empty`);
        }
        const id = normalizeText(row.id);
        if (id && ids.has(id)) fail(`${label} duplicate id ${JSON.stringify(id)}`);
        if (id) ids.add(id);
        const claimKey = normalizeText(row.claimKey);
        if (claimKey && claimKeys.has(claimKey)) {
            fail(`${label} duplicate normalized claimKey ${JSON.stringify(claimKey)}`);
        }
        if (claimKey) claimKeys.add(claimKey);
        const sourceKey = normalizeText(row.sourceKey);
        if (sourceKey && sourceKeys.has(sourceKey)) {
            fail(`${label} duplicate sourceKey ${JSON.stringify(sourceKey)}`);
        }
        if (sourceKey) sourceKeys.add(sourceKey);

        if (normalizeText(row.kind) && !policy.allowedKinds?.includes(row.kind)) {
            fail(`${label} has unknown kind ${JSON.stringify(row.kind)}`);
        }
        if (normalizeText(row.status) && !policy.allowedStatuses?.includes(row.status)) {
            fail(`${label} has unknown status ${JSON.stringify(row.status)}`);
        }
        if (
            policy.allowedKinds?.includes(row.kind) &&
            policy.allowedStatuses?.includes(row.status) &&
            !policy.kindStatuses?.[row.kind]?.includes(row.status)
        ) {
            fail(`${label} status contradicts kind ${row.kind}`);
        }
        if (policy.allowedKinds?.includes(row.kind) && !policy.claimUniverse?.includes(row.kind)) {
            fail(`${label} is outside declared canonical universe`);
        }

        const truthPath = canonicalPath(row.sourceOfTruth);
        if (!truthPath) {
            fail(`${label}.sourceOfTruth path is unsafe`);
        } else {
            const forbidden = forbiddenSource(truthPath);
            if (forbidden === "receipt") fail(`${label} receipt cannot be a canonical claim source`);
            if (forbidden === "archived") {
                fail(`${label} archived or historical source cannot be canonical`);
            }
            if (read(truthPath) == null) fail(`${label}.sourceOfTruth does not exist`);
        }

        if (!Array.isArray(row.locations) || row.locations.length === 0) {
            fail(`${label}.locations must be non-empty`);
        } else {
            const rowPaths = new Set();
            for (const location of row.locations) {
                if (typeof location?.path !== "string" || location.path.trim() === "") {
                    fail(`${label} location path must be non-empty`);
                    continue;
                }
                const locationPath = canonicalPath(location.path);
                if (!locationPath) {
                    fail(`${label} location path is unsafe`);
                    continue;
                }
                const forbiddenLocation = forbiddenSource(locationPath);
                if (forbiddenLocation === "receipt") {
                    fail(`${label} receipt cannot be a canonical claim location`);
                }
                if (forbiddenLocation === "archived") {
                    fail(`${label} archived or historical location cannot be canonical`);
                }
                if (rowPaths.has(locationPath)) fail(`${label} duplicate location path ${locationPath}`);
                rowPaths.add(locationPath);
                const marker = normalizeText(location.marker);
                const signature = `${locationPath}#${marker}`;
                if (canonicalLocations.has(signature)) {
                    fail(`${label} conflicting canonical location ${signature}`);
                } else {
                    canonicalLocations.set(signature, index);
                }
                const contents = read(locationPath);
                if (contents == null) {
                    fail(`${label} location path does not exist: ${locationPath}`);
                } else if (!marker || !contents.includes(location.marker)) {
                    fail(`${label} location marker is not anchored`);
                }
            }
        }

        if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
            fail(`${label}.evidence must be non-empty`);
        } else {
            for (const evidence of row.evidence) {
                if (!isObject(evidence) || !EVIDENCE_TYPES.has(evidence.type)) {
                    fail(`${label} has unknown evidence type ${JSON.stringify(evidence?.type)}`);
                    continue;
                }
                if (evidence.type === "make-target") {
                    const evidencePath = canonicalPath(evidence.path);
                    if (!evidencePath) {
                        fail(`${label} evidence path is unsafe`);
                        continue;
                    }
                    if (evidencePath !== makefilePath) {
                        fail(`${label} Make evidence must use ${makefilePath}`);
                    }
                    if (!makeTargets.has(evidence.target)) {
                        fail(`${label} evidence names made-up Make target ${JSON.stringify(evidence.target)}`);
                    }
                    continue;
                }
                if (typeof evidence.path !== "string" || evidence.path.trim() === "") {
                    fail(`${label} evidence path must be non-empty`);
                    continue;
                }
                const evidencePath = canonicalPath(evidence.path);
                if (!evidencePath) {
                    fail(`${label} evidence path is unsafe`);
                    continue;
                }
                if (
                    evidence.type === "contract" &&
                    !policy.evidenceTypes?.contracts?.map(canonicalPath).includes(evidencePath)
                ) {
                    fail(`${label} contract evidence path is not declared`);
                }
                if (
                    evidence.type === "generated-surface" &&
                    !policy.evidenceTypes?.generatedSurfaces?.map(canonicalPath).includes(evidencePath)
                ) {
                    fail(`${label} generated-surface evidence path is not declared`);
                }
                if (evidence.type === "receipt") {
                    const receiptRoots = policy.evidenceTypes?.receiptRoots?.map((value) =>
                        `${canonicalPath(value)}/`,
                    );
                    if (!receiptRoots?.some((rootPath) => evidencePath.startsWith(rootPath))) {
                        fail(`${label} receipt evidence path is outside declared roots`);
                    }
                }
                const contents = read(evidencePath);
                if (contents == null) {
                    fail(`${label} evidence path does not exist: ${evidencePath}`);
                } else if (normalizeText(evidence.marker) === "" || !contents.includes(evidence.marker)) {
                    fail(`${label} evidence marker is not anchored`);
                }
            }
        }
        if (
            row.kind === "roadmap" &&
            row.status === "complete" &&
            !row.evidence?.some((evidence) => evidence?.type === "receipt")
        ) {
            fail(`${label} complete roadmap claim requires receipt evidence`);
        }
    }

    const sources = policy.canonicalSources ?? {};
    const roadmapPath = canonicalPath(sources.roadmap?.path);
    const roadmapStatusPath = canonicalPath(sources.roadmap?.statusPath);
    const roadmapRows = parseRoadmap(read(roadmapPath), fail);
    const roadmapKeys = roadmapRows.map((row) => row.sourceKey);
    sourceCoverage(
        fail,
        "roadmap canonical source keys",
        sources.roadmap?.keys ?? [],
        roadmapKeys,
    );
    sourceCoverage(
        fail,
        "roadmap claim coverage",
        sources.roadmap?.keys ?? [],
        claims.filter((row) => row?.kind === "roadmap").map((row) => row.sourceKey),
    );
    const roadmapClaims = new Map(
        claims.filter((row) => row?.kind === "roadmap").map((row) => [row.sourceKey, row]),
    );
    const roadmapStatus = parseJson(read(roadmapStatusPath), "roadmap status source", fail);
    const selectors = sources.roadmap?.statusSelectors ?? [];
    const statusOverlayByTask = new Map();
    if (roadmapStatus) {
        const actualStatusKeys = Object.keys(roadmapStatus).filter((key) =>
            /^task\d+(?:to\d+)?$/u.test(key),
        );
        sourceCoverage(
            fail,
            "roadmap status selector keys",
            selectors.map((selector) => selector.key),
            actualStatusKeys,
        );
        for (const selector of selectors) {
            const overlay = roadmapStatus[selector.key];
            for (const taskNumber of selector.taskNumbers ?? []) {
                statusOverlayByTask.set(taskNumber, {
                    statusKey: selector.key,
                    fields: overlay,
                });
            }
        }
    }
    for (const source of roadmapRows) {
        const claim = roadmapClaims.get(source.sourceKey);
        if (!claim) continue;
        const expected = {
            taskNumber: source.taskNumber,
            title: source.title,
            dependsOn: source.dependsOn,
            stateText: source.stateText,
            closure: source.closure,
            releaseBlocking: source.releaseBlocking,
            statusOverlay: statusOverlayByTask.get(source.taskNumber) ?? null,
        };
        if (!same(claim.projection, expected)) {
            fail(`${claim.sourceKey} roadmap projection drift`);
        }
        if (!same(claim.projection?.statusOverlay, expected.statusOverlay)) {
            fail(`${claim.sourceKey} roadmap structured overlay drift`);
        }
        if (claim.status !== source.state) fail(`${claim.sourceKey} roadmap status drift`);
        if (canonicalPath(claim.sourceOfTruth) !== roadmapPath) {
            fail(`${claim.sourceKey} roadmap sourceOfTruth drift`);
        }
    }

    if (roadmapStatus) {
        for (const selector of selectors) {
            const overlay = roadmapStatus[selector.key];
            const overlayState = roadmapState(overlay?.status);
            if (!overlayState) {
                fail(`roadmap status ${selector.key} has unsupported state`);
                continue;
            }
            for (const taskNumber of selector.taskNumbers ?? []) {
                const sourceKey = `roadmap:task-${String(taskNumber).padStart(2, "0")}`;
                const claim = roadmapClaims.get(sourceKey);
                if (!claim) continue;
                if (claim.status !== overlayState) fail(`${sourceKey} roadmap/status state drift`);
                const expectedMarker =
                    selector.locationMarkers?.[String(taskNumber)] ?? `"${selector.key}"`;
                if (
                    !claim.locations?.some(
                        (location) =>
                            canonicalPath(location.path) === roadmapStatusPath &&
                            location.marker === expectedMarker,
                    )
                ) {
                    fail(`${sourceKey} missing roadmap status location`);
                }
            }
        }
    }

    const riskPath = canonicalPath(sources.risk?.path);
    const riskSource = parseJson(read(riskPath), "risk canonical source", fail);
    const risks = Array.isArray(riskSource?.risks) ? riskSource.risks : [];
    if (!Array.isArray(riskSource?.risks)) fail("risk canonical source must contain risks");
    const riskKeys = risks.map((risk) => `risk:${risk.id}`);
    if (new Set(riskKeys).size !== riskKeys.length) fail("risk canonical source has duplicate ids");
    sourceCoverage(fail, "risk canonical source keys", sources.risk?.keys ?? [], riskKeys);
    sourceCoverage(
        fail,
        "risk claim coverage",
        sources.risk?.keys ?? [],
        claims.filter((row) => row?.kind === "risk").map((row) => row.sourceKey),
    );
    const riskClaims = new Map(
        claims.filter((row) => row?.kind === "risk").map((row) => [row.sourceKey, row]),
    );
    for (const risk of risks) {
        const sourceKey = `risk:${risk.id}`;
        const claim = riskClaims.get(sourceKey);
        if (!claim) continue;
        if (!same(claim.projection, riskProjection(risk))) fail(`${sourceKey} risk projection drift`);
        if (claim.status !== risk.status) fail(`${sourceKey} risk status drift`);
        if (canonicalPath(claim.sourceOfTruth) !== riskPath) {
            fail(`${sourceKey} risk sourceOfTruth drift`);
        }
    }

    const workflowPath = canonicalPath(sources.workflow?.path);
    const workflowSource = parseJson(read(workflowPath), "workflow canonical source", fail);
    const workflows = Array.isArray(workflowSource?.workflows) ? workflowSource.workflows : [];
    if (!Array.isArray(workflowSource?.workflows)) {
        fail("workflow canonical source must contain workflows");
    }
    const workflowKeys = workflows.map((workflow) => `workflow:${workflow.id}`);
    if (new Set(workflowKeys).size !== workflowKeys.length) {
        fail("workflow canonical source has duplicate ids");
    }
    sourceCoverage(
        fail,
        "workflow canonical source keys",
        sources.workflow?.keys ?? [],
        workflowKeys,
    );
    sourceCoverage(
        fail,
        "workflow claim coverage",
        sources.workflow?.keys ?? [],
        claims.filter((row) => row?.kind === "workflow").map((row) => row.sourceKey),
    );
    const workflowClaims = new Map(
        claims.filter((row) => row?.kind === "workflow").map((row) => [row.sourceKey, row]),
    );
    for (const workflow of workflows) {
        const sourceKey = `workflow:${workflow.id}`;
        const claim = workflowClaims.get(sourceKey);
        if (!claim) continue;
        const projection = claim.projection;
        for (const field of policy.workflowBacking?.requiredFields ?? []) {
            const value = projection?.[field];
            const absent =
                value == null ||
                (field === "surfaceAvailability" &&
                    (!isObject(value) || Object.keys(value).length === 0)) ||
                (field !== "intentionalGaps" && Array.isArray(value) && value.length === 0) ||
                (typeof value === "string" && value.trim() === "") ||
                (field === "intentionalGaps" && !Array.isArray(value));
            if (absent) fail(`${sourceKey} workflow projection missing ${field}`);
        }
        if (!same(projection, workflowProjection(workflow))) {
            fail(`${sourceKey} workflow projection drift`);
        }
        const expectedStatus = workflow.intentionalGaps?.length
            ? "available-with-gaps"
            : "available";
        if (claim.status !== expectedStatus) fail(`${sourceKey} workflow status drift`);
        if (claim.workflowId !== workflow.id) fail(`${sourceKey} workflowId drift`);
        if (canonicalPath(claim.sourceOfTruth) !== workflowPath) {
            fail(`${sourceKey} workflow sourceOfTruth drift`);
        }
    }

    const readinessSources = sources.readiness?.claims ?? [];
    const readinessKeys = readinessSources.map((source) => source.sourceKey);
    if (new Set(readinessKeys).size !== readinessKeys.length) {
        fail("readiness canonical source has duplicate source keys");
    }
    sourceCoverage(
        fail,
        "readiness claim coverage",
        readinessKeys,
        claims.filter((row) => row?.kind === "readiness").map((row) => row.sourceKey),
    );
    const readinessClaims = new Map(
        claims.filter((row) => row?.kind === "readiness").map((row) => [row.sourceKey, row]),
    );
    const openFinalReadinessBlockers = risks.filter(
        (risk) => risk.finalReadinessBlocking === true && risk.status !== "accepted",
    ).length;
    for (const source of readinessSources) {
        const sourcePath = canonicalPath(source.path);
        if (!sourcePath) {
            fail(`${source.sourceKey} readiness source path is unsafe`);
            continue;
        }
        const forbidden = forbiddenSource(sourcePath);
        if (forbidden === "receipt") {
            fail(`${source.sourceKey} receipt cannot be a canonical claim source`);
        }
        if (forbidden === "archived") {
            fail(`${source.sourceKey} archived or historical source cannot be canonical`);
        }
        const sourceText = read(sourcePath);
        if (sourceText == null || !sourceText.includes(source.marker)) {
            fail(`${source.sourceKey} readiness source marker is not anchored`);
        }
        const claim = readinessClaims.get(source.sourceKey);
        if (!claim) continue;
        if (!same(claim.projection, source.projection)) {
            fail(`${source.sourceKey} readiness projection drift`);
        }
        if (
            Object.hasOwn(source.projection ?? {}, "openFinalReadinessBlockers") &&
            source.projection.openFinalReadinessBlockers !== openFinalReadinessBlockers
        ) {
            fail(`${source.sourceKey} readiness blocker projection drift`);
        }
        if (
            Object.hasOwn(source.projection ?? {}, "makeTarget") &&
            !makeTargets.has(source.projection.makeTarget)
        ) {
            fail(`${source.sourceKey} readiness projection names made-up Make target`);
        }
        if (claim.status !== source.status) fail(`${source.sourceKey} readiness status drift`);
        if (canonicalPath(claim.sourceOfTruth) !== sourcePath) {
            fail(`${source.sourceKey} readiness sourceOfTruth drift`);
        }
        if (
            !claim.locations?.some(
                (location) =>
                    canonicalPath(location.path) === sourcePath && location.marker === source.marker,
            )
        ) {
            fail(`${source.sourceKey} readiness location drift`);
        }
    }

    return failures;
}

export function validateUniqueClaimInventoryDocument({ root, text, files }) {
    let inventory;
    try {
        inventory = JSON.parse(text);
    } catch (error) {
        return [`malformed inventory JSON: ${error.message}`];
    }
    return validateUniqueClaimInventory({ root, policy: inventory?.policy, inventory, files });
}
