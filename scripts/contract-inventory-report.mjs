// Planner module: contract inventory report.
// Invoked via `node scripts/plan.mjs contract-inventory`.
// Does not run Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Planner scripts are reached through scripts/plan.mjs; map basename to dispatcher topic.
const PLANNER_TOPIC_BY_SCRIPT = {
    "scripts/onboarding-plan.mjs": "onboarding",
    "scripts/workflow-plan.mjs": "workflow",
    "scripts/acceptance-plan.mjs": "acceptance",
    "scripts/examples-plan.mjs": "examples",
    "scripts/change-impact-plan.mjs": "change-impact",
    "scripts/maintenance-plan.mjs": "maintenance",
    "scripts/performance-calibration-plan.mjs": "performance-calibration",
    "scripts/release-decision-plan.mjs": "release-decision",
    "scripts/contract-inventory-report.mjs": "contract-inventory",
    "scripts/risk-status-report.mjs": "risk-status",
};

function commandReferencesScript(documentedCommand, scriptPath) {
    if (!documentedCommand) return false;
    const topic = PLANNER_TOPIC_BY_SCRIPT[scriptPath];
    if (topic) return documentedCommand.startsWith(`node scripts/plan.mjs ${topic}`);
    return documentedCommand.includes(scriptPath);
}

async function exists(relPath) {
    try {
        await access(path.join(root, relPath));
        return true;
    } catch {
        return false;
    }
}

async function readJson(relPath) {
    return JSON.parse(await readFile(path.join(root, relPath), "utf8"));
}

async function discoverRequiredDocs() {
    const names = await readdir(path.join(root, "docs"));
    return names
        .filter((name) => name.endsWith("-contract.json") || name.endsWith("-policy.md"))
        .map((name) => `docs/${name}`)
        .sort();
}

function duplicates(items = []) {
    const seen = new Set();
    const duplicateItems = new Set();
    for (const item of items) {
        if (seen.has(item)) duplicateItems.add(item);
        seen.add(item);
    }
    return [...duplicateItems].sort();
}

function isSafeRelativePath(value) {
    if (typeof value !== "string" || value.trim().length === 0) return false;
    const normalized = path.normalize(value);
    return !path.isAbsolute(value) && normalized !== ".." && !normalized.startsWith(`..${path.sep}`);
}

function collectInventoryShapeStatus(inventory) {
    const schemaIssues = [];
    const unsafePaths = [];
    const typedListIssues = [];
    const booleanIssues = [];
    const minimumCountIssues = [];
    const invalidEntryShapes = [];

    if (inventory.schemaVersion !== 1) schemaIssues.push("schemaVersion must be 1");
    if (typeof inventory.purpose !== "string" || inventory.purpose.trim().length === 0) {
        schemaIssues.push("purpose must be a non-empty string");
    }
    if (!Array.isArray(inventory.inventoryInvariants) || inventory.inventoryInvariants.length === 0) {
        typedListIssues.push("inventoryInvariants must be a non-empty string array");
    }

    const checkPath = (label, value) => {
        if (!isSafeRelativePath(value)) unsafePaths.push(label);
    };
    const checkStringList = (label, values) => {
        if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
            typedListIssues.push(label);
        }
    };

    if (inventory.reportGenerator == null || typeof inventory.reportGenerator !== "object") {
        schemaIssues.push("reportGenerator must be an object");
    } else {
        checkPath("reportGenerator.path", inventory.reportGenerator.path);
        if (
            typeof inventory.reportGenerator.makeTarget !== "string" ||
            inventory.reportGenerator.makeTarget.trim().length === 0
        ) {
            schemaIssues.push("reportGenerator.makeTarget must be a non-empty string");
        }
        checkStringList("reportGenerator.contains", inventory.reportGenerator.contains);
        const generatedReport = inventory.reportGenerator.generatedReport ?? {};
        if (generatedReport == null || typeof generatedReport !== "object" || Array.isArray(generatedReport)) {
            schemaIssues.push("reportGenerator.generatedReport must be an object");
        } else {
            for (const [field, value] of Object.entries(generatedReport.minimumCounts ?? {})) {
                if (!Number.isInteger(value) || value < 0) minimumCountIssues.push(field);
            }
        }
    }

    const entries = Array.isArray(inventory.entries) ? inventory.entries : [];
    if (!Array.isArray(inventory.entries) || inventory.entries.length === 0) {
        typedListIssues.push("entries must be a non-empty array");
    }
    for (const [index, entry] of entries.entries()) {
        const label = typeof entry?.id === "string" && entry.id.length > 0 ? entry.id : `entries[${index}]`;
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
            invalidEntryShapes.push(label);
            continue;
        }
        if (typeof entry.id !== "string" || entry.id.trim().length === 0) schemaIssues.push(`${label}.id`);
        if (typeof entry.target !== "string" || entry.target.trim().length === 0) schemaIssues.push(`${label}.target`);
        checkPath(`${label}.checker`, entry.checker);
        for (const field of ["reports", "policies", "contracts", "auditIds"]) {
            checkStringList(`${label}.${field}`, entry[field] ?? []);
            if (field !== "auditIds") {
                for (const relPath of entry[field] ?? []) checkPath(`${label}.${field}`, relPath);
            }
        }
        for (const field of ["perfectFast", "perfectFull"]) {
            if (entry[field] != null && typeof entry[field] !== "boolean") booleanIssues.push(`${label}.${field}`);
        }
    }

    return {
        schemaIssues,
        unsafePaths,
        typedListIssues,
        booleanIssues,
        minimumCountIssues,
        invalidEntryShapes,
    };
}

const structuralInvariantIds = [
    "valid-schema-version",
    "valid-purpose",
    "safe-inventory-paths",
    "typed-entry-lists",
    "typed-report-generator-config",
];

export async function buildReport() {
    const inventory = await readJson("docs/contract-inventory.json");
    const inventoryShapeStatus = collectInventoryShapeStatus(inventory);
    const toolboxContract = await readJson("docs/operator-toolbox-contract.json");
    const toolboxText = await readFile(path.join(root, toolboxContract.toolbox?.path ?? "docs/operator-toolbox.md"), "utf8");
    const docsIndexText = await readFile(path.join(root, "docs/README.md"), "utf8");
    const qualityGatesText = await readFile(path.join(root, "docs/quality-gates.md"), "utf8");
    const entries = Array.isArray(inventory.entries)
        ? inventory.entries.filter(
              (entry) => entry != null && typeof entry === "object" && !Array.isArray(entry) && !entry.retired,
          )
        : [];
    const missingFiles = [];
    const contractTextByPath = new Map();

    for (const entry of entries) {
        for (const relPath of [
            entry.checker,
            ...(entry.policies ?? []),
            ...(entry.contracts ?? []),
            ...(entry.reports ?? []),
        ]) {
            if (relPath && !(await exists(relPath))) missingFiles.push({ id: entry.id, path: relPath });
        }
        for (const relPath of entry.contracts ?? []) {
            try {
                contractTextByPath.set(relPath, await readFile(path.join(root, relPath), "utf8"));
            } catch {
                contractTextByPath.set(relPath, "");
            }
        }
    }

    const perfectFast = entries.filter((entry) => entry.perfectFast).map((entry) => entry.id);
    const perfectFull = entries.filter((entry) => entry.perfectFull).map((entry) => entry.id);
    const withoutPolicies = entries
        .filter((entry) => (entry.policies ?? []).length === 0)
        .map((entry) => entry.id);
    const withoutAuditIds = entries
        .filter((entry) => (entry.auditIds ?? []).length === 0)
        .map((entry) => entry.id);
    const withReports = entries.filter((entry) => (entry.reports ?? []).length > 0).map((entry) => entry.id);
    const listedDocs = new Set(entries.flatMap((entry) => [...(entry.policies ?? []), ...(entry.contracts ?? [])]));
    const requiredDocs = await discoverRequiredDocs();
    const unlistedRequiredDocs = requiredDocs.filter((relPath) => !listedDocs.has(relPath));
    const docsIndexLinks = [...listedDocs].map((relPath) => `./${relPath.replace(/^docs\//, "")}`).sort();
    const missingDocsIndexLinks = docsIndexLinks.filter((docsLink) => !docsIndexText.includes(docsLink));
    const qualityGateTargets = entries.map((entry) => `make ${entry.target}`).sort();
    const presentQualityGateTargets = qualityGateTargets.filter((marker) => qualityGatesText.includes(marker));
    const missingQualityGateTargets = qualityGateTargets.filter((marker) => !qualityGatesText.includes(marker));
    const ownedHelperReports = new Set();
    if (inventory.reportGenerator?.path) ownedHelperReports.add(inventory.reportGenerator.path);
    for (const entry of entries) {
        for (const reportPath of entry.reports ?? []) ownedHelperReports.add(reportPath);
    }
    const toolboxHelperScripts = toolboxContract.helperScripts ?? [];
    const missingToolboxHelperOwners = toolboxHelperScripts.filter(
        (helperPath) => !ownedHelperReports.has(helperPath),
    );
    const helperScriptSet = new Set(toolboxHelperScripts);
    const commandCoverageEntries = toolboxContract.helperCommandCoverage ?? [];
    const commandCoverageByScript = new Map(
        commandCoverageEntries.map((entry) => [entry.script, entry.documentedCommand]),
    );
    const commandCoverageScriptCounts = new Map();
    for (const entry of commandCoverageEntries) {
        commandCoverageScriptCounts.set(entry.script, (commandCoverageScriptCounts.get(entry.script) ?? 0) + 1);
    }
    const extraToolboxHelperCommands = commandCoverageEntries
        .map((entry) => entry.script)
        .filter((helperPath) => !helperScriptSet.has(helperPath));
    const duplicateToolboxHelperCommands = [...commandCoverageScriptCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([helperPath]) => helperPath);
    const missingToolboxHelperCommands = toolboxHelperScripts.filter((helperPath) => {
        const documentedCommand = commandCoverageByScript.get(helperPath);
        return (
            !documentedCommand ||
            !commandReferencesScript(documentedCommand, helperPath) ||
            !toolboxText.includes(documentedCommand)
        );
    });
    const entryDuplicateLists = [];
    for (const entry of entries) {
        for (const field of ["reports", "policies", "contracts", "auditIds"]) {
            const duplicateValues = duplicates(entry[field] ?? []);
            if (duplicateValues.length > 0) {
                entryDuplicateLists.push({ id: entry.id, field, duplicates: duplicateValues });
            }
        }
    }
    const orderedProofChainMarkers = [
        "finalProofCommandOrder",
        "requiredFinalProofCommandOrder",
        "requiredOrderedArrays",
    ];
    const orderedProofChainEntries = entries
        .map((entry) => {
            const matchingContracts = (entry.contracts ?? []).filter((relPath) => {
                const text = contractTextByPath.get(relPath) ?? "";
                return orderedProofChainMarkers.some((marker) => text.includes(marker));
            });
            return {
                id: entry.id,
                contracts: matchingContracts,
            };
        })
        .filter((entry) => entry.contracts.length > 0);
    const orderedProofChainEntryIds = orderedProofChainEntries.map((entry) => entry.id).sort();
    const requiredOrderedProofChainEntries =
        inventory.reportGenerator?.generatedReport?.requiredOrderedProofChainEntries ?? [];
    const missingOrderedProofChainEntries = requiredOrderedProofChainEntries.filter(
        (id) => !orderedProofChainEntryIds.includes(id),
    );

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        network: "none",
        commandsExecuted: [],
        envValuesCaptured: false,
        reportScope: "contract-inventory",
        warning: "This report is not proof. Run make contract-inventory and target-specific gates before claiming readiness.",
        counts: {
            entries: entries.length,
            perfectFast: perfectFast.length,
            perfectFull: perfectFull.length,
            withPolicyDocs: entries.length - withoutPolicies.length,
            withAuditIds: entries.length - withoutAuditIds.length,
            withReports: withReports.length,
            toolboxHelpers: toolboxHelperScripts.length,
            toolboxHelpersOwned: toolboxHelperScripts.length - missingToolboxHelperOwners.length,
            toolboxHelperCommands: toolboxHelperScripts.length,
            toolboxHelperCommandsCovered: toolboxHelperScripts.length - missingToolboxHelperCommands.length,
            toolboxHelperCommandEntries: commandCoverageEntries.length,
            toolboxHelperCommandExtras: extraToolboxHelperCommands.length,
            toolboxHelperCommandDuplicates: duplicateToolboxHelperCommands.length,
            inventoryInvariants: (inventory.inventoryInvariants ?? []).length,
            inventoryInvariantFailures:
                inventoryShapeStatus.schemaIssues.length +
                inventoryShapeStatus.unsafePaths.length +
                inventoryShapeStatus.typedListIssues.length +
                inventoryShapeStatus.booleanIssues.length +
                inventoryShapeStatus.minimumCountIssues.length +
                inventoryShapeStatus.invalidEntryShapes.length +
                duplicates(entries.map((entry) => entry.id)).length +
                duplicates(entries.map((entry) => entry.target)).length +
                duplicates(inventory.reportGenerator?.contains ?? []).length +
                duplicates(inventory.reportGenerator?.generatedReport?.requiredEntryIds ?? []).length +
                duplicates(inventory.reportGenerator?.generatedReport?.requiredToolboxHelperScripts ?? []).length +
                entryDuplicateLists.length +
                missingOrderedProofChainEntries.length,
            orderedProofChainEntries: orderedProofChainEntries.length,
            missingOrderedProofChainEntries: missingOrderedProofChainEntries.length,
            requiredDocs: requiredDocs.length,
            listedRequiredDocs: requiredDocs.length - unlistedRequiredDocs.length,
            unlistedRequiredDocs: unlistedRequiredDocs.length,
            docsIndexLinks: docsIndexLinks.length,
            docsIndexLinksPresent: docsIndexLinks.length - missingDocsIndexLinks.length,
            missingDocsIndexLinks: missingDocsIndexLinks.length,
            qualityGateTargets: qualityGateTargets.length,
            qualityGateTargetsPresent: presentQualityGateTargets.length,
            missingQualityGateTargets: missingQualityGateTargets.length,
            missingFiles: missingFiles.length,
        },
        missingFiles,
        inventoryShapeStatus,
        requiredDocCoverage: {
            inventoryPath: "docs/contract-inventory.json",
            requiredDocs,
            listedRequiredDocs: requiredDocs.filter((relPath) => listedDocs.has(relPath)),
            unlistedRequiredDocs,
        },
        docsIndexCoverage: {
            indexPath: "docs/README.md",
            links: docsIndexLinks,
            presentLinks: docsIndexLinks.filter((docsLink) => docsIndexText.includes(docsLink)),
            missingLinks: missingDocsIndexLinks,
        },
        qualityGateCoverage: {
            path: "docs/quality-gates.md",
            targets: qualityGateTargets,
            presentTargets: presentQualityGateTargets,
            missingTargets: missingQualityGateTargets,
        },
        inventoryInvariantStatus: {
            contractPath: "docs/contract-inventory.json",
            invariants: inventory.inventoryInvariants ?? [],
            structuralInvariants: structuralInvariantIds.filter((invariant) =>
                (inventory.inventoryInvariants ?? []).includes(invariant),
            ),
            duplicateEntryIds: duplicates(entries.map((entry) => entry.id)),
            duplicateEntryTargets: duplicates(entries.map((entry) => entry.target)),
            duplicateReportGeneratorMarkers: duplicates(inventory.reportGenerator?.contains ?? []),
            duplicateRequiredEntryIds: duplicates(
                inventory.reportGenerator?.generatedReport?.requiredEntryIds ?? [],
            ),
            duplicateRequiredToolboxHelperScripts: duplicates(
                inventory.reportGenerator?.generatedReport?.requiredToolboxHelperScripts ?? [],
            ),
            entryDuplicateLists,
        },
        orderedProofChainCoverage: {
            markers: orderedProofChainMarkers,
            entries: orderedProofChainEntries,
            requiredEntries: requiredOrderedProofChainEntries,
            missingRequiredEntries: missingOrderedProofChainEntries,
        },
        toolboxHelperOwnership: {
            contractPath: "docs/operator-toolbox-contract.json",
            inventoryPath: "docs/contract-inventory.json",
            ownedBy: toolboxContract.helperOwnership?.ownedBy ?? [],
            helpers: toolboxHelperScripts.map((helperPath) => ({
                path: helperPath,
                owned: ownedHelperReports.has(helperPath),
            })),
            missingOwners: missingToolboxHelperOwners,
        },
        toolboxHelperCommandCoverage: {
            contractPath: "docs/operator-toolbox-contract.json",
            toolboxPath: toolboxContract.toolbox?.path ?? "docs/operator-toolbox.md",
            helpers: toolboxHelperScripts.map((helperPath) => {
                const documentedCommand = commandCoverageByScript.get(helperPath) ?? null;
                return {
                    path: helperPath,
                    documentedCommand,
                    covered:
                        Boolean(documentedCommand) &&
                        commandReferencesScript(documentedCommand, helperPath) &&
                        toolboxText.includes(documentedCommand),
                };
            }),
            missingCommands: missingToolboxHelperCommands,
            extraCommands: extraToolboxHelperCommands,
            duplicateCommands: duplicateToolboxHelperCommands,
        },
        withoutPolicies,
        withoutAuditIds,
        entries: entries.map((entry) => ({
            id: entry.id,
            target: entry.target,
            checker: entry.checker,
            policies: entry.policies ?? [],
            contracts: entry.contracts ?? [],
            reports: entry.reports ?? [],
            auditIds: entry.auditIds ?? [],
            perfectFast: Boolean(entry.perfectFast),
            perfectFull: Boolean(entry.perfectFull),
        })),
        next:
            missingFiles.length > 0
                ? ["Restore missing checker, policy, or contract files before running proof gates."]
                : ["Run make contract-inventory for wiring proof, then the target-specific gates you changed."],
    };
}

export function renderMarkdown(report) {
    const lines = ["# Contract Inventory Report", ""];
    lines.push("This report is not proof. It does not run commands.");
    lines.push("");
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push("");
    lines.push("## Counts");
    lines.push("");
    for (const [key, value] of Object.entries(report.counts)) lines.push(`- ${key}: ${value}`);
    lines.push("");
    if (report.missingFiles.length > 0) {
        lines.push("## Missing files");
        lines.push("");
        for (const missing of report.missingFiles) lines.push(`- ${missing.id}: \`${missing.path}\``);
        lines.push("");
    }
    lines.push("## Required doc coverage");
    lines.push("");
    if (report.requiredDocCoverage.unlistedRequiredDocs.length === 0) {
        lines.push("- all required contract/policy docs are inventoried");
    } else {
        for (const relPath of report.requiredDocCoverage.unlistedRequiredDocs) {
            lines.push(`- unlisted required doc: \`${relPath}\``);
        }
    }
    lines.push("");
    lines.push("## Docs index coverage");
    lines.push("");
    if (report.docsIndexCoverage.missingLinks.length === 0) {
        lines.push("- all inventoried policy/contract docs are linked from docs/README.md");
    } else {
        for (const docsLink of report.docsIndexCoverage.missingLinks) {
            lines.push(`- missing docs index link: \`${docsLink}\``);
        }
    }
    lines.push("");
    lines.push("## Quality gate coverage");
    lines.push("");
    if (report.qualityGateCoverage.missingTargets.length === 0) {
        lines.push("- all inventory targets are listed in docs/quality-gates.md");
    } else {
        for (const target of report.qualityGateCoverage.missingTargets) {
            lines.push(`- missing quality gate target: \`${target}\``);
        }
    }
    lines.push("");
    lines.push("## Inventory shape status");
    lines.push("");
    const shapeSections = [
        ["schema issue", report.inventoryShapeStatus.schemaIssues],
        ["unsafe path", report.inventoryShapeStatus.unsafePaths],
        ["typed-list issue", report.inventoryShapeStatus.typedListIssues],
        ["boolean issue", report.inventoryShapeStatus.booleanIssues],
        ["minimum-count issue", report.inventoryShapeStatus.minimumCountIssues],
        ["invalid entry shape", report.inventoryShapeStatus.invalidEntryShapes],
    ];
    if (shapeSections.every(([, values]) => values.length === 0)) {
        lines.push("- inventory JSON shape checks are clean");
    } else {
        for (const [label, values] of shapeSections) {
            for (const value of values) lines.push(`- ${label}: \`${value}\``);
        }
    }
    lines.push("");
    lines.push("## Inventory invariants");
    lines.push("");
    for (const invariant of report.inventoryInvariantStatus.invariants) {
        lines.push(`- invariant: \`${invariant}\``);
    }
    if (report.inventoryInvariantStatus.structuralInvariants.length > 0) {
        lines.push("");
        lines.push("Structural shape invariants:");
        for (const invariant of report.inventoryInvariantStatus.structuralInvariants) {
            lines.push(`- structural: \`${invariant}\``);
        }
    }
    const duplicateSections = [
        ["duplicate entry ids", report.inventoryInvariantStatus.duplicateEntryIds],
        ["duplicate entry targets", report.inventoryInvariantStatus.duplicateEntryTargets],
        ["duplicate report-generator markers", report.inventoryInvariantStatus.duplicateReportGeneratorMarkers],
        ["duplicate required entry ids", report.inventoryInvariantStatus.duplicateRequiredEntryIds],
        [
            "duplicate required toolbox helper scripts",
            report.inventoryInvariantStatus.duplicateRequiredToolboxHelperScripts,
        ],
    ];
    for (const [label, values] of duplicateSections) {
        for (const value of values) lines.push(`- ${label}: \`${value}\``);
    }
    for (const duplicate of report.inventoryInvariantStatus.entryDuplicateLists) {
        lines.push(
            `- duplicate ${duplicate.field} in ${duplicate.id}: ${duplicate.duplicates.map((value) => `\`${value}\``).join(", ")}`,
        );
    }
    lines.push("");
    lines.push("## Ordered proof chain coverage");
    lines.push("");
    if (report.orderedProofChainCoverage.missingRequiredEntries.length === 0) {
        lines.push("- all required ordered proof-chain contracts are inventoried");
    } else {
        for (const id of report.orderedProofChainCoverage.missingRequiredEntries) {
            lines.push(`- missing ordered proof-chain entry: \`${id}\``);
        }
    }
    for (const entry of report.orderedProofChainCoverage.entries) {
        lines.push(`- ${entry.id}: ${entry.contracts.map((contractPath) => `\`${contractPath}\``).join(", ")}`);
    }
    lines.push("");
    lines.push("## Toolbox helper ownership");
    lines.push("");
    for (const helper of report.toolboxHelperOwnership.helpers) {
        lines.push(`- ${helper.owned ? "owned" : "missing owner"}: \`${helper.path}\``);
    }
    lines.push("");
    lines.push("## Toolbox helper command coverage");
    lines.push("");
    for (const helper of report.toolboxHelperCommandCoverage.helpers) {
        lines.push(
            `- ${helper.covered ? "covered" : "missing command"}: \`${helper.path}\`${helper.documentedCommand ? ` -> \`${helper.documentedCommand}\`` : ""}`,
        );
    }
    for (const helperPath of report.toolboxHelperCommandCoverage.extraCommands) {
        lines.push(`- extra command mapping: \`${helperPath}\``);
    }
    for (const helperPath of report.toolboxHelperCommandCoverage.duplicateCommands) {
        lines.push(`- duplicate command mapping: \`${helperPath}\``);
    }
    lines.push("");
    lines.push("## Entries");
    lines.push("");
    for (const entry of report.entries) {
        lines.push(
            `- ${entry.id}: \`make ${entry.target}\`, checker \`${entry.checker}\`, perfect-fast ${entry.perfectFast ? "yes" : "no"}, perfect-full ${entry.perfectFull ? "yes" : "no"}`,
        );
        if (entry.reports.length > 0) {
            lines.push(`  helpers: ${entry.reports.map((report) => `\`${report}\``).join(", ")}`);
        }
    }
    lines.push("");
    lines.push("## Next");
    lines.push("");
    for (const item of report.next) lines.push(`- ${item}`);
    return `${lines.join("\n")}\n`;
}

