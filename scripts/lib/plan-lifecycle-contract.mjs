function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

const EXPECTED_STATES = [
    "pending",
    "in_progress",
    "implemented",
    "evidence_captured",
    "complete",
    "archived",
];

const ALLOWED_TRANSITIONS = new Set([
    "pending->in_progress",
    "pending->implemented",
    "in_progress->implemented",
    "implemented->evidence_captured",
    "evidence_captured->complete",
    "complete->archived",
]);

const EXPECTED_TRANSITIONS = Object.freeze({
    pending: ["in_progress", "implemented"],
    in_progress: ["implemented"],
    implemented: ["evidence_captured"],
    evidence_captured: ["complete"],
    complete: ["archived"],
    archived: [],
});

function successfulClosureResults(contract) {
    if (Array.isArray(contract?.successfulClosureResults)) return contract.successfulClosureResults;
    return [contract?.successfulClosureResult];
}

function hasClosureEvidence(task, contract) {
    return (
        typeof task?.receipt === "string" &&
        task.receipt.trim() !== "" &&
        typeof task?.closureCommand === "string" &&
        task.closureCommand.trim() !== "" &&
        successfulClosureResults(contract).includes(task.closureResult)
    );
}

function hasFile(files, relativePath) {
    if (files instanceof Set) return files.has(relativePath);
    if (Array.isArray(files)) return files.includes(relativePath);
    if (typeof files === "function") return files(relativePath);
    return false;
}

function validateReceiptPath(failures, task, contract, files) {
    if (task.receipt == null) return;
    const label = `task ${task.id} receipt`;
    if (typeof task.receipt !== "string" || task.receipt.trim() === "") {
        failures.push(`${label}: must be a non-empty repo-relative path`);
        return;
    }
    const segments = task.receipt.split(/[\\/]+/);
    if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(task.receipt)) {
        failures.push(`${label}: must be repo-relative`);
        return;
    }
    if (segments.includes("..")) {
        failures.push(`${label}: must not escape the repository`);
        return;
    }
    const receiptRoot = `${contract.receiptRoot}/`;
    if (!task.receipt.startsWith(receiptRoot)) {
        failures.push(`${label}: must be under ${contract.receiptRoot}`);
        return;
    }
    const expectedPrefix = `task-${String(task.id).padStart(2, "0")}`;
    const basename = segments.at(-1) ?? "";
    if (!basename.startsWith(expectedPrefix)) {
        failures.push(`${label}: names the wrong task; expected ${expectedPrefix}`);
    }
    if (!hasFile(files, task.receipt)) failures.push(`${label}: does not exist`);
}

const FULL_COMMIT = /^[0-9a-f]{40}$/u;

function validateTask1ApprovalRecord(failures, record, policy, task) {
    if (!isObject(record)) return;
    const label = "Task 1 approval";
    if (typeof record.receipt !== "string" || record.receipt !== task?.receipt) {
        failures.push(`${label}: receipt must match the tracked Task 1 receipt`);
    }
    if (!FULL_COMMIT.test(record.currentPreCloseHead ?? "") || !FULL_COMMIT.test(record.reviewedHead ?? "")) {
        failures.push(`${label}: reviewed head identities must be full 40-character commits`);
    }
    if (record.reviewedHead === policy.initialImplementationCommit) {
        failures.push(`${label}: cannot name only the initial implementation commit`);
    }
    if (record.reviewedHead !== record.currentPreCloseHead) {
        failures.push(`${label}: stale head; reviewedHead must equal the resolved pre-close head`);
    }
    const rangePrefix = `${policy.rangeStart}..`;
    if (typeof record.reviewedRange !== "string" || !record.reviewedRange.startsWith(rangePrefix)) {
        failures.push(`${label}: reviewed range must begin at ${policy.rangeStart}`);
    } else if (record.reviewedRange !== `${rangePrefix}${record.currentPreCloseHead}`) {
        failures.push(`${label}: must cover the full pre-close range`);
    }
    const approvals = Array.isArray(record.approvals) ? record.approvals : [];
    const identities = approvals
        .map((approval) => approval?.identity)
        .filter((identity) => typeof identity === "string" && identity.trim() !== "");
    if (approvals.length < policy.minimumApprovals) {
        failures.push(`${label}: requires at least ${policy.minimumApprovals} independent approvals`);
    }
    if (identities.length !== approvals.length || new Set(identities).size < policy.minimumApprovals) {
        failures.push(`${label}: requires ${policy.minimumApprovals} distinct independent approval identities`);
    }
    for (const [index, approval] of approvals.entries()) {
        if (approval?.receipt !== record.receipt) {
            failures.push(`${label}[${index}]: approval receipt must match the tracked Task 1 receipt`);
        }
        if (
            approval?.reviewedHead !== record.reviewedHead ||
            approval?.reviewedRange !== record.reviewedRange
        ) {
            failures.push(`${label}[${index}]: must name the same resolved head and full range`);
        }
    }
    if (Number.isInteger(task?.recordedIndependentApprovals) && approvals.length !== task.recordedIndependentApprovals) {
        failures.push(`${label}: concrete approval records must match recordedIndependentApprovals`);
    }
}

const PROTECTED_EVIDENCE_ONLY_FIELDS = new Set([
    "allowedKinds",
    "allowedPathsByTask",
    "allowedStatuses",
    "approvalCannotNameOnlyInitialImplementationCommit",
    "boundary",
    "closureCommand",
    "closureGate",
    "correctionFields",
    "dependencyMode",
    "dependencySemantics",
    "dependsOn",
    "expectedTaskIds",
    "finalReadinessBlocking",
    "gitDerivedFields",
    "impact",
    "initialImplementationCommit",
    "kind",
    "minimumApprovals",
    "mitigation",
    "purpose",
    "rangeStart",
    "receiptRoot",
    "releaseBlocking",
    "requiredIndependentApprovals",
    "requiredNonBlockingOpenOrProvisionalRiskIds",
    "requiredReadinessBlockingRiskIds",
    "resolutionRule",
    "reviewModel",
    "schemaVersion",
    "sourceOfTruth",
    "states",
    "successfulClosureResult",
    "successfulClosureResults",
    "summary",
    "surface",
    "symbolicCommitIdentity",
    "task1DependencySemantics",
    "taskNumber",
    "title",
    "transitions",
]);

const PROTECTED_EVIDENCE_ONLY_FIELDS_BY_PATH = new Map([
    ["docs/risk-register.json", new Set([
        "disposition",
        "resolution",
        "resolutionStatus",
        "riskDisposition",
        "riskStatus",
        "status",
    ])],
]);

const PLAN_LIFECYCLE_CONTRACT_PATH = "docs/plan-lifecycle-contract.json";
const TASK1_DYNAMIC_CLOSEOUT_FIELDS = new Set([
    "closureResult",
    "plannedReceipt",
    "receipt",
    "recordedIndependentApprovals",
    "remainingBlockers",
    "state",
]);

function sameJsonValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function parsePlanLifecycleSnapshot(failures, label, value, side) {
    if (typeof value !== "string" || value.trim() === "") {
        failures.push(`${label}: git-derived plan-lifecycle contract requires ${side} snapshot`);
        return null;
    }
    try {
        const parsed = JSON.parse(value);
        if (!isObject(parsed)) throw new TypeError("root must be an object");
        return parsed;
    } catch (error) {
        failures.push(`${label}: git-derived plan-lifecycle contract ${side} snapshot is invalid JSON: ${error.message}`);
        return null;
    }
}

function validatePlanLifecycleContractSnapshot(failures, label, snapshot) {
    if (!isObject(snapshot)) {
        failures.push(`${label}: git-derived plan-lifecycle contract requires before/after snapshots`);
        return;
    }
    const before = parsePlanLifecycleSnapshot(failures, label, snapshot.before, "before");
    const after = parsePlanLifecycleSnapshot(failures, label, snapshot.after, "after");
    if (before == null || after == null) return;

    const allowedTopLevel = new Set([
        "currentEvidenceOnlyCloseout",
        "currentTask1ApprovalRecord",
        "tasks",
    ]);
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (!allowedTopLevel.has(field) && !sameJsonValue(before[field], after[field])) {
            failures.push(`${label}: git-derived plan-lifecycle contract top-level field ${field} is protected`);
        }
    }

    if (!Array.isArray(before.tasks) || !Array.isArray(after.tasks)) {
        failures.push(`${label}: git-derived plan-lifecycle contract task graph is protected`);
        return;
    }
    const beforeIds = before.tasks.map((task) => task?.id);
    const afterIds = after.tasks.map((task) => task?.id);
    if (!sameJsonValue(beforeIds, afterIds)) {
        failures.push(`${label}: git-derived plan-lifecycle contract task graph is protected`);
        return;
    }

    for (const [index, beforeTask] of before.tasks.entries()) {
        const afterTask = after.tasks[index];
        const taskId = beforeTask?.id;
        if (!isObject(beforeTask) || !isObject(afterTask)) {
            failures.push(`${label}: git-derived plan-lifecycle contract task ${taskId ?? index} is protected`);
            continue;
        }
        const changedFields = [...new Set([...Object.keys(beforeTask), ...Object.keys(afterTask)])]
            .filter((field) => !sameJsonValue(beforeTask[field], afterTask[field]));
        if (taskId === 1) {
            for (const field of changedFields) {
                if (!TASK1_DYNAMIC_CLOSEOUT_FIELDS.has(field)) {
                    failures.push(`${label}: git-derived plan-lifecycle contract Task 1 field ${field} is protected`);
                }
            }
        } else if (changedFields.length > 0) {
            failures.push(`${label}: git-derived plan-lifecycle contract task ${taskId} field ${changedFields[0]} is protected`);
        }
    }
}

const PROTECTED_ROADMAP_PROSE = /\b(?:allowed transitions?|dependency semantics?|execution prerequisites?|exact closure command|final readiness|final release\/acceptance|lifecycle semantics?|readiness risk|release-blocking|required independent approvals?)\b/iu;

function changedDiffLine(line) {
    return /^[+-]/u.test(line) && !/^(?:---|\+\+\+)/u.test(line);
}

function evidenceOnlyFieldIsProtected(relativePath, field) {
    return PROTECTED_EVIDENCE_ONLY_FIELDS.has(field)
        || PROTECTED_EVIDENCE_ONLY_FIELDS_BY_PATH.get(relativePath)?.has(field) === true;
}

function roadmapDiffRow(content) {
    if (!content.startsWith("|")) return null;
    const cells = content
        .slice(1, content.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((cell) => cell.trim());
    const taskMatch = cells[0]?.match(/^(\d+)\.\s+/u);
    return taskMatch == null ? null : { taskId: Number(taskMatch[1]), cells };
}

function validateRoadmapRows(failures, label, taskId, removedRows, addedRows) {
    const rowIds = new Set([...removedRows.keys(), ...addedRows.keys()]);
    for (const rowId of rowIds) {
        const removed = removedRows.get(rowId) ?? [];
        const added = addedRows.get(rowId) ?? [];
        if (rowId !== taskId || removed.length !== added.length) {
            failures.push(`${label}: git-derived diff roadmap task identity is protected`);
            continue;
        }
        for (const [index, before] of removed.entries()) {
            const after = added[index];
            for (const [cellIndex, field] of [
                [0, "task identity"],
                [1, "dependency"],
                [4, "closure command"],
                [5, "release readiness"],
            ]) {
                if (before.cells[cellIndex] !== after.cells[cellIndex]) {
                    failures.push(`${label}: git-derived diff roadmap ${field} is protected`);
                }
            }
        }
    }
}

function validateEvidenceOnlyDiff(failures, label, diff, allowedPaths, changedPaths, taskId, fileSnapshots) {
    let currentPath = "";
    let jsonFieldContext = "";
    const diffPaths = new Set();
    const removedRoadmapRows = new Map();
    const addedRoadmapRows = new Map();

    for (const line of diff.split("\n")) {
        const header = line.match(/^diff --git a\/(.+) b\/(.+)$/u);
        if (header != null) {
            currentPath = header[2];
            jsonFieldContext = "";
            diffPaths.add(currentPath);
            if (!allowedPaths.has(currentPath)) {
                failures.push(`${label}: git-derived diff path ${currentPath} is not allowed`);
            }
            continue;
        }

        if (currentPath === "" || /^(?:---|\+\+\+|@@)/u.test(line)) continue;
        const content = /^[ +\-]/u.test(line) ? line.slice(1) : line;
        const fields = [...content.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/gu)].map((match) => match[1]);
        if (fields.length > 0) jsonFieldContext = fields.at(-1);
        if (!changedDiffLine(line) || currentPath.startsWith("docs/roadmap-1.0-receipts/")) continue;

        if (currentPath === "docs/roadmap-1.0.md") {
            const row = roadmapDiffRow(content);
            if (row != null) {
                const rows = line.startsWith("-") ? removedRoadmapRows : addedRoadmapRows;
                const existing = rows.get(row.taskId) ?? [];
                existing.push(row);
                rows.set(row.taskId, existing);
            } else if (content.trim() !== "" && PROTECTED_ROADMAP_PROSE.test(content)) {
                failures.push(`${label}: git-derived diff roadmap lifecycle/readiness prose is protected`);
            }
            continue;
        }

        const protectedField = fields.find((field) => evidenceOnlyFieldIsProtected(currentPath, field));
        if (protectedField != null) {
            failures.push(`${label}: git-derived diff field ${protectedField} is protected`);
        } else if (fields.length === 0 && evidenceOnlyFieldIsProtected(currentPath, jsonFieldContext)) {
            failures.push(`${label}: git-derived diff field ${jsonFieldContext} is protected`);
        }
    }

    for (const changedPath of changedPaths) {
        if (!diffPaths.has(changedPath)) {
            failures.push(`${label}: git-derived diff is missing changed path ${changedPath}`);
        }
    }
    for (const diffPath of diffPaths) {
        if (!changedPaths.includes(diffPath)) {
            failures.push(`${label}: git-derived diff path ${diffPath} is absent from changedPaths`);
        }
    }
    validateRoadmapRows(failures, label, taskId, removedRoadmapRows, addedRoadmapRows);
    if (diffPaths.has(PLAN_LIFECYCLE_CONTRACT_PATH)) {
        validatePlanLifecycleContractSnapshot(
            failures,
            label,
            fileSnapshots?.[PLAN_LIFECYCLE_CONTRACT_PATH],
        );
    }
}

function validateGitDiff(failures, label, evidence, allowedPaths, taskId) {
    if (!isObject(evidence)) {
        failures.push(`${label}: SELF requires git-derived commit, parent, changedPaths, and diff evidence`);
        return;
    }
    if (!FULL_COMMIT.test(evidence.head ?? "") || !FULL_COMMIT.test(evidence.parent ?? "")) {
        failures.push(`${label}: git-derived head and parent must be full commit identities`);
    }
    if (!Array.isArray(evidence.changedPaths) || evidence.changedPaths.length === 0) {
        failures.push(`${label}: git-derived changedPaths must be non-empty`);
    } else {
        for (const changedPath of evidence.changedPaths) {
            if (!allowedPaths.has(changedPath)) {
                failures.push(`${label}: git-derived ${changedPath} is not allowed`);
            }
        }
    }
    if (typeof evidence.diff !== "string" || evidence.diff.trim() === "") {
        failures.push(`${label}: git-derived diff must be non-empty`);
    } else if (Array.isArray(evidence.changedPaths)) {
        validateEvidenceOnlyDiff(
            failures,
            label,
            evidence.diff,
            allowedPaths,
            evidence.changedPaths,
            taskId,
            evidence.fileSnapshots,
        );
    }
}

function validateEvidenceOnlyCloseout(failures, closeout, policy, approvalRecord, gitEvidence, task1Complete) {
    if (!isObject(closeout)) return;
    const label = "evidence-only closeout";
    if (task1Complete && closeout.taskId !== 1) {
        failures.push("Task 1 complete: current evidence-only closeout must use taskId 1");
    }
    const allowedPaths = new Set(policy?.allowedPathsByTask?.[String(closeout.taskId)] ?? []);
    if (closeout.closeoutCommit !== "SELF") {
        failures.push(`${label}: closeoutCommit must use the symbolic SELF identity`);
    }
    if (closeout.reviewedHead !== approvalRecord?.reviewedHead || closeout.reviewedRange !== approvalRecord?.reviewedRange) {
        failures.push(`${label}: must name the approved reviewedHead and reviewedRange`);
    }
    validateGitDiff(failures, label, gitEvidence, allowedPaths, closeout.taskId);
    if (closeout.behaviorChanged === true) failures.push(`${label}: must not change product or API behavior`);
    if (closeout.taskSemanticsChanged === true) failures.push(`${label}: must not change task semantics after review`);
    if (closeout.correction === true) {
        if (!FULL_COMMIT.test(closeout.priorCloseoutCommit ?? "")) {
            failures.push(`${label} correction: must name a prior concrete closeout commit`);
        }
        if (gitEvidence?.parent !== closeout.priorCloseoutCommit) {
            failures.push(`${label} correction: SELF parent must equal priorCloseoutCommit`);
        }
        if (
            !isObject(gitEvidence?.priorCloseout) ||
            gitEvidence.priorCloseout.commit !== closeout.priorCloseoutCommit
        ) {
            failures.push(`${label} correction: requires git-derived evidence for the prior concrete closeout`);
        } else {
            validateGitDiff(failures, `${label} prior closeout`, {
                ...gitEvidence.priorCloseout,
                head: gitEvidence.priorCloseout.commit,
            }, allowedPaths, closeout.taskId);
            if (gitEvidence.priorCloseout.parent !== approvalRecord?.reviewedHead) {
                failures.push(`${label} correction: prior closeout parent must equal reviewedHead`);
            }
        }
        if (typeof closeout.reviewedEvidenceChanged !== "boolean") {
            failures.push(`${label} correction: must state whether reviewed evidence changes`);
        } else if (task1Complete && closeout.reviewedEvidenceChanged) {
            failures.push(`${label} correction: changed evidence invalidates Task 1 approval`);
        }
    } else if (gitEvidence?.parent !== approvalRecord?.reviewedHead) {
        failures.push(`${label}: SELF parent must equal reviewedHead`);
    }
}

function validateLifecyclePacket(failures, packet) {
    if (!isObject(packet)) return;
    const basename = typeof packet.path === "string" ? packet.path.split("/").at(-1) : "";
    if (basename === "" || !packet.indexText?.includes(`(./${basename})`)) {
        failures.push("lifecycle packet: absent from index");
    }
    if (!Array.isArray(packet.contractPackets) || !packet.contractPackets.includes(packet.path)) {
        failures.push("lifecycle packet: absent from contract");
    }
    for (const section of packet.requiredSections ?? []) {
        if (!packet.text?.includes(section)) failures.push(`lifecycle packet: missing required section ${section}`);
    }
    for (const marker of ["TODO", "TBD", "FIXME", "CHANGEME"]) {
        if (packet.text?.includes(marker)) failures.push(`lifecycle packet: placeholder marker ${marker}`);
    }
    const requiredRules = [
        "docs/plan-lifecycle-policy.md",
        "exact closure command",
        "Track the task receipt",
        "remaining blocker",
        "Stop without claiming complete",
    ];
    if (requiredRules.some((rule) => !packet.text?.includes(rule))) {
        failures.push("lifecycle packet: missing lifecycle/stop rule");
    }
}

const FORBIDDEN_GUIDANCE_PATTERNS = [
    /(?:remove|discard|delete) temporary context .*\b(?:before|prior to)\b.*evidence capture/gi,
    /(?:declare|claim|mark|is|treat).{0,40}(?:done|complete|completion).{0,40}(?:chat memory|static marker|status row)/gi,
    /(?:done|complete|completion).{0,20}\bfrom\b.{0,20}(?:chat memory|static marker|status row)/gi,
];

// A prohibition of the anti-pattern (e.g. "Never declare completion from a
// status row") is exactly the guidance we want. Scope negation to the
// completion predicate so a later weak-evidence object cannot negate it.
const GUIDANCE_ACTION_NEGATION = /\b(?:never|cannot|do not|don['’]t|must not|avoid|no longer)(?:\s+(?:be|been|being|ever))?(?:\s+(?:claim|declare|mark|treat)(?:ed|ing)?(?:\s+(?:the\s+)?task)?)?\s*$/iu;
const GUIDANCE_PREDICATE_NEGATION = /\b(?:never|not|no longer)(?:\s+(?:necessarily|yet))?\s*$/iu;

function guidanceMatchIsNegated(text, match) {
    const index = match.index;
    const prefix = text.slice(0, index);
    const boundaries = [...prefix.matchAll(/[.!?;:\n]+|\b(?:but|however|yet)\b/gi)];
    const lastBoundary = boundaries.at(-1);
    const clauseStart = lastBoundary == null ? 0 : lastBoundary.index + lastBoundary[0].length;
    const completionPredicate = match[0].match(/\b(?:done|complete|completion)\b/iu);
    const actionPrefix = text.slice(clauseStart, index);
    if (GUIDANCE_ACTION_NEGATION.test(actionPrefix)) return true;
    if (completionPredicate == null) return false;
    return GUIDANCE_PREDICATE_NEGATION.test(match[0].slice(0, completionPredicate.index));
}

function textAssertsForbiddenGuidance(text) {
    for (const pattern of FORBIDDEN_GUIDANCE_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
            if (!guidanceMatchIsNegated(text, match)) return true;
        }
    }
    return false;
}

function validateGuidance(failures, guidance) {
    for (const entry of guidance ?? []) {
        if (textAssertsForbiddenGuidance(String(entry?.text ?? ""))) {
            failures.push(`guidance ${entry?.path ?? "?"}: forbidden completion rule`);
        }
    }
}

function validateTerminology(failures, terminology, states) {
    for (const binding of terminology ?? []) {
        const surfaceStates = (binding?.surfaces ?? []).map((surface) => surface?.state);
        const unknown = surfaceStates.filter((state) => !states.includes(state));
        if (unknown.length > 0 || new Set(surfaceStates).size > 1) {
            failures.push(`task ${binding?.taskId ?? "?"} terminology: conflicting canonical lifecycle states`);
        }
    }
}

function canonicalLifecycleState(value, states) {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return states.find((state) => normalized === state || normalized.startsWith(`${state} `) || normalized.startsWith(`${state} (`)) ?? null;
}

function sameNumberList(left, right) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function parseRoadmapLifecycleRows(failures, text, states) {
    const rows = new Map();
    for (const line of typeof text === "string" ? text.split("\n") : []) {
        if (!line.startsWith("|")) continue;
        const cells = line
            .slice(1, line.endsWith("|") ? -1 : undefined)
            .split("|")
            .map((cell) => cell.trim());
        const taskMatch = cells[0]?.match(/^(\d+)\.\s+/u);
        if (!taskMatch) continue;
        const taskId = Number(taskMatch[1]);
        const state = canonicalLifecycleState(cells[2], states);
        if (rows.has(taskId)) failures.push(`task ${taskId} roadmap: duplicate row`);
        if (state == null) failures.push(`task ${taskId} roadmap: unknown lifecycle state`);
        const dependsOn = cells[1] === "—" ? [] : [...(cells[1]?.matchAll(/\d+/gu) ?? [])].map((match) => Number(match[0]));
        rows.set(taskId, { state, dependsOn });
    }
    return rows;
}

function validateCanonicalSources(failures, sources, tasks, states) {
    if (!isObject(sources)) return;
    const roadmap = parseRoadmapLifecycleRows(failures, sources.roadmapText, states);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const roadmapIds = [...roadmap.keys()].sort((left, right) => left - right);
    const taskIds = [...tasksById.keys()].sort((left, right) => left - right);
    if (JSON.stringify(roadmapIds) !== JSON.stringify(taskIds)) {
        failures.push(`canonical lifecycle roadmap coverage: expected tasks ${taskIds.join(", ")} but got ${roadmapIds.join(", ")}`);
    }
    for (const [taskId, row] of roadmap) {
        const task = tasksById.get(taskId);
        if (task == null) continue;
        if (row.state !== task.state) failures.push(`task ${taskId} contract/roadmap lifecycle drift`);
        if (!sameNumberList(row.dependsOn, task.dependsOn)) {
            failures.push(`task ${taskId} contract/roadmap dependency drift`);
        }
    }

    const statusTaskIds = new Set();
    const discoveredStatusKeys = Object.entries(sources.roadmapStatus ?? {})
        .filter(([, overlay]) => canonicalLifecycleState(overlay?.lifecycleState ?? overlay?.status, states) != null)
        .map(([key]) => key)
        .sort();
    const configuredStatusKeys = (sources.statusBindings ?? []).map((binding) => binding?.key).sort();
    if (JSON.stringify(discoveredStatusKeys) !== JSON.stringify(configuredStatusKeys)) {
        failures.push(
            `roadmap status overlay coverage drift: expected ${discoveredStatusKeys.join(", ")} but got ${configuredStatusKeys.join(", ")}`,
        );
    }
    for (const binding of sources.statusBindings ?? []) {
        const overlay = sources.roadmapStatus?.[binding?.key];
        const state = canonicalLifecycleState(overlay?.lifecycleState ?? overlay?.status, states);
        if (state == null) {
            failures.push(`roadmap status ${binding?.key ?? "?"}: unknown lifecycle state`);
            continue;
        }
        for (const taskId of binding?.taskIds ?? []) {
            if (statusTaskIds.has(taskId)) failures.push(`task ${taskId} roadmap status: duplicate binding`);
            statusTaskIds.add(taskId);
            const row = roadmap.get(taskId);
            if (row == null || row.state !== state) failures.push(`task ${taskId} roadmap/status lifecycle drift`);
        }
    }

    const claims = Array.isArray(sources.uniqueClaimInventory?.claims)
        ? sources.uniqueClaimInventory.claims.filter((claim) => claim?.kind === "roadmap")
        : [];
    const claimsByTask = new Map();
    for (const claim of claims) {
        const taskId = claim?.projection?.taskNumber;
        if (!Number.isInteger(taskId)) {
            failures.push("unique-claim roadmap row: missing task number");
            continue;
        }
        if (claimsByTask.has(taskId)) failures.push(`task ${taskId} unique-claim: duplicate row`);
        claimsByTask.set(taskId, claim);
    }
    const claimIds = [...claimsByTask.keys()].sort((left, right) => left - right);
    if (JSON.stringify(claimIds) !== JSON.stringify(roadmapIds)) {
        failures.push(`canonical lifecycle unique-claim coverage: expected tasks ${roadmapIds.join(", ")} but got ${claimIds.join(", ")}`);
    }
    for (const [taskId, row] of roadmap) {
        const claim = claimsByTask.get(taskId);
        if (claim == null) continue;
        const claimState = canonicalLifecycleState(claim.status, states);
        const projectionState = canonicalLifecycleState(claim.projection?.stateText, states);
        if (claimState !== row.state || projectionState !== row.state) {
            failures.push(`task ${taskId} roadmap/unique-claim lifecycle drift`);
        }
        if (!sameNumberList(claim.projection?.dependsOn, row.dependsOn)) {
            failures.push(`task ${taskId} roadmap/unique-claim dependency drift`);
        }
    }

    for (const document of sources.terminologyDocuments ?? []) {
        const text = String(document?.text ?? "");
        const presentStates = states.filter((state) => text.includes(`\`${state}\``));
        if (JSON.stringify(presentStates) !== JSON.stringify(states)) {
            failures.push(`${document?.path ?? "terminology document"}: canonical lifecycle vocabulary drift`);
        }
    }
}

export function validatePlanLifecycle(input) {
    const failures = [];
    const contract = isObject(input?.contract) ? input.contract : {};
    const states = Array.isArray(contract.states) ? contract.states : [];
    const tasks = Array.isArray(input?.tasks) ? input.tasks : [];

    if (JSON.stringify(states) !== JSON.stringify(EXPECTED_STATES)) {
        failures.push(`states: expected closed vocabulary ${EXPECTED_STATES.join(", ")}`);
    }

    const transitions = isObject(contract.transitions) ? contract.transitions : {};
    for (const [from, destinations] of Object.entries(transitions)) {
        if (!Array.isArray(destinations)) {
            failures.push(`transition ${from}: destinations must be an array`);
            continue;
        }
        for (const to of destinations) {
            if (!ALLOWED_TRANSITIONS.has(`${from}->${to}`)) {
                failures.push(`transition ${from} -> ${to}: not allowed`);
            }
        }
    }
    for (const [from, expectedDestinations] of Object.entries(EXPECTED_TRANSITIONS)) {
        if (JSON.stringify(transitions[from]) !== JSON.stringify(expectedDestinations)) {
            failures.push(`transition ${from}: must equal ${JSON.stringify(expectedDestinations)}`);
        }
    }

    const approvalPolicy = contract.task1ApprovalPolicy ?? {};
    if (approvalPolicy.rangeStart !== "ec68c61") failures.push("Task 1 approval policy: range must begin at ec68c61");
    if (approvalPolicy.minimumApprovals !== 2) failures.push("Task 1 approval policy: minimumApprovals must be 2");
    if (approvalPolicy.reviewModel !== "pre_close_range_evidence_only_closeout") {
        failures.push("Task 1 approval policy: must use the pre-close range plus evidence-only closeout model");
    }
    if (approvalPolicy.dependencySemantics !== "final_release_acceptance_blocker") {
        failures.push("Task 1 dependency: must be a final release/acceptance blocker, not an execution prerequisite");
    }

    const byId = new Map();
    for (const task of tasks) {
        if (byId.has(task?.id)) failures.push(`duplicate task id ${task?.id}`);
        else byId.set(task?.id, task);
    }

    for (const task of tasks) {
        if (!states.includes(task?.state)) {
            failures.push(`task ${task?.id ?? "?"} state: unknown state ${JSON.stringify(task?.state)}`);
        }

        validateReceiptPath(failures, task, contract, input?.files);

        const blockers = Array.isArray(task?.remainingBlockers)
            ? task.remainingBlockers.filter((blocker) => typeof blocker === "string" && blocker.trim() !== "")
            : [];
        if (task.state === "pending" && (task.receipt != null || task.closureResult != null)) {
            failures.push(`task ${task.id} pending: must not claim closure evidence`);
        }
        if (["in_progress", "implemented", "evidence_captured"].includes(task.state) && blockers.length === 0) {
            failures.push(`task ${task.id} ${task.state}: must name at least one remaining blocker`);
        }
        if (task.state === "evidence_captured" && !hasClosureEvidence(task, contract)) {
            failures.push(`task ${task.id} evidence_captured: requires a tracked receipt, exact closure command, and successful closure result`);
        }
        if (task.state === "complete") {
            if (typeof task.receipt !== "string" || task.receipt.trim() === "") {
                failures.push(`task ${task.id} complete: requires a tracked receipt`);
            }
            if (typeof task.closureCommand !== "string" || task.closureCommand.trim() === "") {
                failures.push(`task ${task.id} complete: requires an exact closure command`);
            }
            if (!successfulClosureResults(contract).includes(task.closureResult)) {
                failures.push(
                    `task ${task.id} complete: requires a successful closure result (${successfulClosureResults(contract).join(" or ")})`,
                );
            }
            const requiredApprovals = task.requiredIndependentApprovals;
            const recordedApprovals = task.recordedIndependentApprovals;
            if (!Number.isInteger(requiredApprovals) || requiredApprovals <= 0) {
                failures.push(`task ${task.id} complete: requiredIndependentApprovals must be an explicit positive integer`);
            }
            if (!Number.isInteger(recordedApprovals) || recordedApprovals < 0) {
                failures.push(`task ${task.id} complete: recordedIndependentApprovals must be an explicit non-negative integer`);
            }
            if (
                Number.isInteger(requiredApprovals) &&
                requiredApprovals > 0 &&
                Number.isInteger(recordedApprovals) &&
                recordedApprovals !== requiredApprovals
            ) {
                failures.push(
                    `task ${task.id} complete: approval counts must match (${requiredApprovals} required, ${recordedApprovals} recorded)`,
                );
            }
            if (blockers.length > 0) failures.push(`task ${task.id} complete: must not retain open blockers`);
        }
        if (task.state === "archived" && task.active !== false) {
            failures.push(`task ${task.id} archived: historical tasks must not be active proof`);
        }
        if (task.state !== "archived" && task.active === false) {
            failures.push(`task ${task.id} ${task.state}: active lifecycle state cannot be archived`);
        }

        const dependencies = Array.isArray(task?.dependsOn) ? task.dependsOn : [];
        for (const dependencyId of dependencies) {
            if (dependencyId === task.id) {
                failures.push(`task ${task.id} dependency ${dependencyId}: task cannot depend on itself`);
                continue;
            }
            const dependency = byId.get(dependencyId);
            if (dependency == null) {
                failures.push(`task ${task.id} dependency ${dependencyId}: missing task`);
                continue;
            }
            if (
                !["pending", "in_progress"].includes(task.state) &&
                task.dependencyMode !== "final_acceptance" &&
                !hasClosureEvidence(dependency, contract)
            ) {
                failures.push(
                    `task ${task.id} dependency ${dependencyId}: direct predecessor lacks a tracked receipt and successful closure result`,
                );
            }
        }
    }

    if (Array.isArray(contract.expectedTaskIds)) {
        const actualIds = [...byId.keys()].sort((a, b) => a - b);
        const expectedIds = [...contract.expectedTaskIds].sort((a, b) => a - b);
        if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
            failures.push(`tasks: expected ids ${expectedIds.join(", ")} but got ${actualIds.join(", ")}`);
        }
    }

    const task2 = byId.get(2);
    if (task2 != null && task2.dependsOn?.includes(1) && task2.dependencyMode !== "final_acceptance") {
        failures.push("task 2 dependency 1: Task 1 must be a final release/acceptance blocker, not an execution prerequisite");
    }

    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    function visit(taskId) {
        if (visiting.has(taskId)) {
            const cycleStart = stack.indexOf(taskId);
            failures.push(`dependency cycle: ${[...stack.slice(cycleStart), taskId].join(" -> ")}`);
            return;
        }
        if (visited.has(taskId)) return;
        visiting.add(taskId);
        stack.push(taskId);
        for (const dependencyId of byId.get(taskId)?.dependsOn ?? []) {
            if (byId.has(dependencyId)) visit(dependencyId);
        }
        stack.pop();
        visiting.delete(taskId);
        visited.add(taskId);
    }
    for (const taskId of byId.keys()) visit(taskId);

    const task1 = byId.get(1);
    const task1Complete = task1?.state === "complete";
    if (task1Complete && !isObject(input?.task1ApprovalRecord)) {
        failures.push("Task 1 complete: requires a concrete currentTask1ApprovalRecord");
    }
    if (task1Complete && !isObject(input?.closeout)) {
        failures.push("Task 1 complete: requires a concrete currentEvidenceOnlyCloseout");
    }
    if (task1Complete && !isObject(input?.gitEvidence)) {
        failures.push("Task 1 complete: SELF closeout requires git-derived evidence");
    }
    validateTask1ApprovalRecord(
        failures,
        input?.task1ApprovalRecord,
        contract.task1ApprovalPolicy ?? {},
        task1,
    );
    validateEvidenceOnlyCloseout(
        failures,
        input?.closeout,
        contract.evidenceOnlyCloseout ?? {},
        input?.task1ApprovalRecord,
        input?.gitEvidence,
        task1Complete,
    );
    validateLifecyclePacket(failures, input?.packet);
    validateGuidance(failures, input?.guidance);
    validateTerminology(failures, input?.terminology, states);
    validateCanonicalSources(failures, input?.canonicalSources, tasks, states);

    return failures;
}
