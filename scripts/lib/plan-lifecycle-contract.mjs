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

function validateTask1ApprovalRecord(failures, record, policy) {
    if (!isObject(record)) return;
    const label = "Task 1 approval";
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
    const reviewers = approvals
        .map((approval) => approval?.reviewer)
        .filter((reviewer) => typeof reviewer === "string" && reviewer.trim() !== "");
    if (approvals.length < policy.minimumApprovals || new Set(reviewers).size < policy.minimumApprovals) {
        failures.push(`${label}: requires at least ${policy.minimumApprovals} independent approvals`);
    }
    for (const [index, approval] of approvals.entries()) {
        if (
            approval?.reviewedHead !== record.reviewedHead ||
            approval?.reviewedRange !== record.reviewedRange
        ) {
            failures.push(`${label}[${index}]: must name the same resolved head and full range`);
        }
    }
}

function validateEvidenceOnlyCloseout(failures, closeout, policy) {
    if (!isObject(closeout)) return;
    const label = "evidence-only closeout";
    const allowedPaths = new Set(policy?.allowedPathsByTask?.[String(closeout.taskId)] ?? []);
    for (const changedPath of closeout.changedPaths ?? []) {
        if (!allowedPaths.has(changedPath)) {
            failures.push(`${label}: ${changedPath} is not allowed`);
        }
    }
    if (closeout.behaviorChanged === true) failures.push(`${label}: must not change product or API behavior`);
    if (closeout.taskSemanticsChanged === true) failures.push(`${label}: must not change task semantics after review`);
    if (closeout.correction === true && typeof closeout.reviewedEvidenceChanged !== "boolean") {
        failures.push(`${label} correction: must state whether reviewed evidence changes`);
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
// status row") is exactly the guidance we want, so a negation immediately
// before the match on the same line is not a violation.
const GUIDANCE_NEGATION = /\b(?:never|not|cannot|do not|don['’]t|must not|without|avoid|no longer)\b/i;

function guidanceMatchIsNegated(text, match) {
    const index = match.index;
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    const windowStart = Math.max(lineStart, index - 20);
    return GUIDANCE_NEGATION.test(text.slice(windowStart, index + match[0].length));
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
            const requiredApprovals = Number.isInteger(task.requiredIndependentApprovals)
                ? task.requiredIndependentApprovals
                : 0;
            const recordedApprovals = Number.isInteger(task.recordedIndependentApprovals)
                ? task.recordedIndependentApprovals
                : 0;
            if (recordedApprovals < requiredApprovals) {
                failures.push(`task ${task.id} complete: requires ${requiredApprovals} independent approvals`);
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

    validateTask1ApprovalRecord(failures, input?.task1ApprovalRecord, contract.task1ApprovalPolicy ?? {});
    validateEvidenceOnlyCloseout(failures, input?.closeout, contract.evidenceOnlyCloseout ?? {});
    validateLifecyclePacket(failures, input?.packet);
    validateGuidance(failures, input?.guidance);
    validateTerminology(failures, input?.terminology, states);

    return failures;
}
