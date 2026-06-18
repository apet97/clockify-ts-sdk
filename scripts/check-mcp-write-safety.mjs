#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = await readJson("docs/mcp-write-safety-contract.json", "contractPath");
// Tool-set discovery comes from the generated structural manifest, not from
// regex-scanning mcp/src/tools/*.ts. Per-tool body markers are still scanned on
// source after the manifest has supplied the destructive tool names.
const toolManifest = await readJson(
    contract.wiring?.toolManifest ?? "docs/mcp-tool-manifest.json",
    "toolManifest",
);

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(relPath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

async function readRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath == null) return "";

    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        fail(safePath, "missing file");
        return "";
    }
}

async function readJson(relPath, label = relPath) {
    const text = await readRel(relPath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return {};
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function callStartsRegExp(functionName, ...args) {
    const identifierArgs = new Set(["ctx", "toolName", "riskClass", "args", "preview"]);
    const renderedArgs = args.map((arg) => {
        if (arg instanceof RegExp) return arg.source;
        if (identifierArgs.has(arg)) return escapeRegExp(arg);
        return `"${escapeRegExp(arg)}"`;
    });
    return new RegExp(`${escapeRegExp(functionName)}\\(\\s*${renderedArgs.join("\\s*,\\s*")}`);
}

// Tools register either via the raw SDK call `server.registerTool("name", ...)`
// or through the type-preserving `defineTool(server, "name", ...)` seam in
// `mcp/src/result.ts`. Both forwarding shapes are equivalent for write-safety
// purposes, so every source scan accepts either.
const REGISTRATION_OPENER = String.raw`(?:server\.registerTool\(\s*|defineTool\(\s*server,\s*)`;

function toolRegistrationRegExp(toolName) {
    return new RegExp(`${REGISTRATION_OPENER}"${toolName}"`);
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
    }
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value <= 0) {
        fail(label, "must be a positive integer");
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function validateMarkerEntry(label, entry, markerField = "contains") {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const markers = assertStringArray(`${label}.${markerField}`, entry[markerField], {
        allowEmpty: false,
    });
    assertUnique(`${label}.${markerField}`, markers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    assertPositiveInteger("minimumDestructiveToolCount", contract.minimumDestructiveToolCount);

    for (const field of [
        "highRiskWorkflowTools",
        "idempotentWorkflowTools",
        "confirmationGuardedDomainTools",
    ]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
    }

    // confirmationExemptDestructiveTools is the escape hatch: destructive
    // delete/remove tools that intentionally must NOT be guarded. It may be
    // empty, but every entry must be a unique non-empty string, must not also
    // appear in confirmationGuardedDomainTools (a tool cannot be both guarded
    // and exempt), and a non-empty list must carry a written reason note.
    const exemptTools = assertStringArray(
        "confirmationExemptDestructiveTools",
        contract.confirmationExemptDestructiveTools,
        {
            allowEmpty: true,
        },
    );
    assertUnique("confirmationExemptDestructiveTools", exemptTools);
    const guardedNames = new Set(
        Array.isArray(contract.confirmationGuardedDomainTools)
            ? contract.confirmationGuardedDomainTools
            : [],
    );
    for (const exemptTool of exemptTools) {
        if (guardedNames.has(exemptTool)) {
            fail(
                "confirmationExemptDestructiveTools",
                `${exemptTool} also appears in confirmationGuardedDomainTools`,
            );
        }
    }
    if (exemptTools.length > 0) {
        assertNonEmptyString(
            "confirmationExemptDestructiveToolsNote",
            contract.confirmationExemptDestructiveToolsNote,
        );
    }

    if (!Array.isArray(contract.requiredFiles) || contract.requiredFiles.length === 0) {
        fail("requiredFiles", "must be a non-empty array");
    }
    assertUnique(
        "requiredFiles.path",
        (contract.requiredFiles ?? [])
            .map((file) => file?.path)
            .filter((filePath) => typeof filePath === "string"),
    );
    for (const [index, file] of (contract.requiredFiles ?? []).entries()) {
        validateMarkerEntry(`requiredFiles[${index}]`, file);
    }

    for (const field of [
        "workflowRequiredMarkers",
        "domainDeleteRequiredMarkers",
        "confirmationRequiredMarkers",
        "forbiddenPolicyMarkers",
    ]) {
        const markers = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, markers);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        safeRelativePath("wiring.toolsDirectory", contract.wiring.toolsDirectory);
        assertNonEmptyString("wiring.workflowsFile", contract.wiring.workflowsFile);
        for (const [index, workflowFile] of (contract.wiring.workflowFiles ?? []).entries()) {
            safeRelativePath(`wiring.workflowFiles[${index}]`, workflowFile);
        }
        safeRelativePath("wiring.confirmGuardFile", contract.wiring.confirmGuardFile);
        assertNonEmptyString("wiring.docsIndexPolicy", contract.wiring.docsIndexPolicy);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
        safeRelativePath("wiring.toolManifest", contract.wiring.toolManifest);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("MCP write-safety contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const file of contract.requiredFiles) {
    const text = await readRel(file.path);
    includesAll(text, file.contains, file.path);
    for (const marker of contract.forbiddenPolicyMarkers) {
        if (text.includes(marker))
            failures.push(`${file.path} contains forbidden marker: ${marker}`);
    }
}

const wiring = contract.wiring ?? {};
const workflowFiles = contract.wiring?.workflowFiles ?? [wiring.workflowsFile];
const workflows = (
    await Promise.all(workflowFiles.map((workflowFile) => readRel(workflowFile)))
).join("\n");
// The dry_run -> confirm_token handshake lives in one shared guard so the
// workflow surface and the destructive domain deletes cannot drift.
const confirmGuard = await readRel(wiring.confirmGuardFile);
includesAll(
    confirmGuard,
    contract.confirmationRequiredMarkers,
    `${wiring.confirmGuardFile} confirmation flow`,
);
// Workflow implementation modules must keep delegating to the shared guard via maybeConfirm.
if (
    !callStartsRegExp(
        "requireConfirmation",
        "ctx",
        "toolName",
        "riskClass",
        "args",
        "preview",
    ).test(workflows)
) {
    failures.push(
        "workflow modules maybeConfirm does not delegate to the shared requireConfirmation guard",
    );
}

for (const toolName of contract.highRiskWorkflowTools) {
    const registration = registrationBlock(workflows, toolName);
    if (!registration) {
        failures.push(`workflow modules missing registration for ${toolName}`);
        continue;
    }
    includesAll(
        registration,
        contract.workflowRequiredMarkers.filter((marker) => marker !== "maybeConfirm"),
        `${toolName} registration`,
    );
    if (!callStartsRegExp("maybeConfirm", "ctx", toolName).test(workflows)) {
        failures.push(`${toolName} does not call maybeConfirm before execution`);
    }
    if (!callStartsRegExp("successResult", toolName).test(workflows)) {
        failures.push(`${toolName} does not return a success receipt`);
    }
}

// Destructive domain delete tools must route through the same shared guard:
// dry_run + confirm_token in their schema and a requireConfirmation call
// before the SDK delete. This closes the gap where a client that ignored
// the destructiveHint annotation could delete with no server-side guard.
const toolsDirectoryRel =
    safeRelativePath("wiring.toolsDirectory", wiring.toolsDirectory) ?? "mcp/src/tools";
const toolFileTexts = [];
{
    const dir = path.join(root, toolsDirectoryRel);
    const files = await listTypeScriptFiles(dir);
    for (const file of files) {
        toolFileTexts.push(await readRel(path.relative(root, file)));
    }
}
function findToolFile(toolName) {
    return toolFileTexts.find((text) => toolRegistrationRegExp(toolName).test(text)) ?? "";
}

for (const toolName of contract.confirmationGuardedDomainTools) {
    const text = findToolFile(toolName);
    const registration = registrationBlock(text, toolName);
    if (!registration) {
        failures.push(`destructive domain tool ${toolName} registration not found`);
        continue;
    }
    includesAll(
        registration,
        contract.domainDeleteRequiredMarkers.filter((marker) => marker !== "requireConfirmation"),
        `${toolName} registration`,
    );
    if (!callStartsRegExp("requireConfirmation", "ctx", toolName).test(text)) {
        failures.push(`${toolName} does not call requireConfirmation before the delete`);
    }
}

const destructiveTools = await discoverDestructiveTools();
if (destructiveTools.length < contract.minimumDestructiveToolCount) {
    failures.push(
        `expected at least ${contract.minimumDestructiveToolCount} destructive MCP tools, found ${destructiveTools.length}`,
    );
}

for (const tool of destructiveTools) {
    if (contract.highRiskWorkflowTools.includes(tool.name)) continue;
    if (contract.idempotentWorkflowTools.includes(tool.name)) {
        if (!tool.registration.includes("idempotentHint: true")) {
            failures.push(`${tool.name} is idempotent workflow but lacks idempotentHint: true`);
        }
        if (!tool.body.includes("clockify_demo_cleanup")) {
            failures.push(`${tool.name} does not point to demo cleanup`);
        }
        continue;
    }

    if (
        !/delete|remove|archive/i.test(tool.name) &&
        !/delete|remove|archive/i.test(tool.registration)
    ) {
        failures.push(
            `${tool.name} is destructive but does not advertise delete/remove/archive semantics`,
        );
    }
    if (!/deleted|removed|archived/i.test(tool.body)) {
        failures.push(
            `${tool.name} is destructive but does not return a delete/remove/archive receipt`,
        );
    }
    if (!/Id\b|Id:|id:/i.test(tool.registration)) {
        failures.push(`${tool.name} is destructive but does not appear ID-scoped`);
    }
}

// Every destructive DELETE/REMOVE domain tool must be guarded (dry_run->confirm)
// or explicitly exempted, so a new unguarded delete cannot ship silently.
//
// The match must catch every name segment that ENDS in delete/remove, not just
// those immediately followed by `_` or end-of-name. `_(delete|remove)\b` was too
// narrow: `\b` after a letter only fires before a non-word char, so it still
// matched `_delete`/`_remove` at a boundary but it failed to express intent
// clearly and is easy to regress. `(?![a-z])` makes the intent explicit:
// delete/remove not immediately followed by another lowercase letter, so
// `_remove_member`, `_delete_all`, and `_delete` are all ENFORCED, while a tool
// like `_removed`/`_delements` (delete/remove glued into a longer word) is not.
const destructiveNamePattern = /_(delete|remove)(?![a-z])/;
// Regression self-check: if a future edit narrows this regex so it no longer
// catches `_remove_member`-shaped names, fail loudly here instead of silently
// letting an unguarded destructive tool ship. The gate's whole value is that
// EVERY delete/remove domain tool is forced into the guarded/exempt decision.
if (
    !destructiveNamePattern.test("clockify_groups_remove_member") ||
    !destructiveNamePattern.test("clockify_entries_delete") ||
    destructiveNamePattern.test("clockify_reports_summary")
) {
    failures.push(
        "destructive name coverage regex regressed: it must match `_remove_member` and plain `_delete` names and must not match a non-destructive name",
    );
}
// Regression self-check for the registration matcher: every tool now goes
// through the `defineTool(server, "...")` seam, but the legacy
// `server.registerTool("...")` shape must also keep matching so the scan
// never silently skips a destructive tool if a file reverts to the raw call.
if (
    !toolRegistrationRegExp("clockify_entries_delete").test(
        'defineTool(\n        server,\n        "clockify_entries_delete",',
    ) ||
    !toolRegistrationRegExp("clockify_entries_delete").test(
        'server.registerTool(\n        "clockify_entries_delete",',
    )
) {
    failures.push(
        'tool registration matcher regressed: it must match both `defineTool(server, "...")` and `server.registerTool("...")`',
    );
}
const guardedSet = new Set(contract.confirmationGuardedDomainTools);
const exemptSet = new Set(contract.confirmationExemptDestructiveTools ?? []);
const workflowSet = new Set([
    ...contract.highRiskWorkflowTools,
    ...contract.idempotentWorkflowTools,
]);
for (const tool of destructiveTools) {
    if (workflowSet.has(tool.name)) continue; // workflow writes use maybeConfirm separately
    if (!destructiveNamePattern.test(tool.name)) continue; // only delete/remove domain tools
    if (guardedSet.has(tool.name) || exemptSet.has(tool.name)) continue;
    failures.push(
        `destructive domain tool ${tool.name} is neither in confirmationGuardedDomainTools nor confirmationExemptDestructiveTools`,
    );
}

// Converse of the loop above: each confirm-guarded domain tool must still be
// present in the structural destructive set. This catches a guarded tool losing
// destructiveHint:true, while the reverse check catches new unguarded deletes.
const destructiveNameSet = new Set(destructiveTools.map((tool) => tool.name));
for (const guardedName of contract.confirmationGuardedDomainTools) {
    if (!destructiveNameSet.has(guardedName)) {
        failures.push(
            `confirmationGuardedDomainTools entry ${guardedName} is not in the manifest destructive set ` +
                "(missing destructiveHint:true) — confirm-guarded tools MUST be destructive",
        );
    }
}

if (!confirmGuard.includes("confirm_token: issued.confirmToken")) {
    failures.push("confirmation preview does not expose confirm_token in receipt data");
}
if (!confirmGuard.includes("store.validate(str(args.confirm_token), payload)")) {
    failures.push("confirmation execution does not validate confirm_token against stable payload");
}

const makefile = await readRel("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`))
    failures.push(`Makefile missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget))
        failures.push(`Makefile ${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) {
    failures.push(`Makefile ${wiring.makeTarget} target does not run checker`);
}

const qualityGates = await readRel("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    failures.push(`docs/quality-gates.md missing ${wiring.qualityGate}`);
}

const docsIndex = await readRel("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexPolicy}`)) {
    failures.push("docs/README.md missing MCP write safety policy link");
}
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) {
    failures.push("docs/README.md missing MCP write safety contract link");
}

const contractInventory = await readRel("docs/contract-inventory.json");
if (!contractInventory.includes(`"id": "${wiring.inventoryId}"`)) {
    failures.push("docs/contract-inventory.json missing mcp-write-safety entry");
}

const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");
if (!enterpriseAudit.includes(`"id": "${wiring.auditId}"`)) {
    failures.push("docs/enterprise-hardening-audit.json missing mcp-write-safety audit entry");
}

if (failures.length > 0) {
    console.error("MCP write-safety contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `MCP write-safety contract passed (${destructiveTools.length} destructive tools checked).`,
);

function registrationBlock(text, toolName) {
    const match = text.match(toolRegistrationRegExp(toolName));
    if (!match || match.index == null) return "";
    const start = match.index;
    const callbackStart = text.indexOf("async (args", start);
    const fallbackEnd = nextRegistrationIndex(text, start + 1);
    const end =
        callbackStart === -1 ? (fallbackEnd === -1 ? start + 1600 : fallbackEnd) : callbackStart;
    return text.slice(start, end);
}

// Index of the next tool registration (either form) at or after `from`, or -1.
function nextRegistrationIndex(text, from) {
    const regex = new RegExp(REGISTRATION_OPENER, "g");
    regex.lastIndex = from;
    const match = regex.exec(text);
    return match ? match.index : -1;
}

async function discoverDestructiveTools() {
    const destructiveNames = (toolManifest.tools ?? [])
        .filter((tool) => tool && tool.destructiveHint === true && typeof tool.name === "string")
        .map((tool) => tool.name);
    const tools = [];
    for (const name of destructiveNames) {
        const text = findToolFile(name);
        if (!text) {
            fail(
                "toolManifest",
                `destructive tool ${name} from manifest has no matching source file`,
            );
            continue;
        }
        const match = text.match(toolRegistrationRegExp(name));
        const start = match?.index ?? 0;
        const next = nextRegistrationIndex(text, start + 1);
        const whole = text.slice(start, next === -1 ? text.length : next);
        const callbackStart = whole.indexOf("async (args");
        const registration =
            callbackStart === -1 ? whole.slice(0, 1600) : whole.slice(0, callbackStart);
        const body = callbackStart === -1 ? whole : whole.slice(callbackStart);
        tools.push({ name, file: "(manifest-keyed)", registration, body });
    }
    return tools;
}

async function listTypeScriptFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listTypeScriptFiles(absolute)));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith(".ts")) files.push(absolute);
    }
    return files.sort((a, b) => a.localeCompare(b));
}
