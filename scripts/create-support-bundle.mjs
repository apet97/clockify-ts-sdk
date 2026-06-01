#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReport as buildContractInventoryReport } from "./contract-inventory-report.mjs";
import { buildReport as buildRiskStatusReport } from "./risk-status-report.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const knownEnvNames = [
    "CLOCKIFY_API_KEY",
    "CLOCKIFY_ADDON_TOKEN",
    "CLOCKIFY_WORKSPACE_ID",
    "CLOCKIFY_BASE_URL",
    "CLOCKIFY_USER_AGENT",
    "CLOCKIFY_REQUEST_ID_PREFIX",
    "DEFER_LIVE_REASON",
    "NPM_TOKEN",
    "GITHUB_TOKEN",
];

const safeCommandHints = [
    "node scripts/plan.mjs workflow --workflow first-run-support",
    "make diagnostics",
    "make quickstart-receipt",
    "make support-bundle",
    "make mock-clockify",
    "make perfect-live",
    "make perfect-full",
];

const diagnosticsSurfaces = [
    {
        surface: "SDK",
        entrypoint: "clockifyDiagnostics()",
        package: "clockify-sdk-ts-115",
        network: "none",
    },
    {
        surface: "CLI",
        entrypoint: "clk115 doctor --json",
        package: "@clockify115/cli",
        network: "none",
    },
    {
        surface: "MCP",
        entrypoint: "clockify://mcp/doctor",
        package: "@clockify115/mcp-server",
        network: "none",
    },
];

function usage() {
    return [
        "Usage: node scripts/create-support-bundle.mjs [--output <path>] [--compact]",
        "",
        "Creates a no-network, redacted support bundle from local metadata only.",
        "Environment variable values, tokens, workspace IDs, raw logs, and live payloads are never captured.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { output: null, pretty: true };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--compact") {
            options.pretty = false;
            continue;
        }
        if (arg === "--output" || arg === "-o") {
            const value = argv[i + 1];
            if (!value || value.startsWith("-")) {
                throw new Error("--output requires a file path");
            }
            options.output = path.resolve(process.cwd(), value);
            i += 1;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function readJson(relPath) {
    try {
        const text = await readFile(path.join(root, relPath), "utf8");
        return { ok: true, path: relPath, data: JSON.parse(text) };
    } catch (error) {
        return {
            ok: false,
            path: relPath,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function lockfileSummary(result) {
    if (!result.ok) {
        return {
            path: "package-lock.json",
            available: false,
            error: result.error,
        };
    }

    const lockfile = result.data;
    const packages = lockfile.packages && typeof lockfile.packages === "object" ? lockfile.packages : {};
    return {
        path: "package-lock.json",
        available: true,
        lockfileVersion: lockfile.lockfileVersion ?? null,
        packageCount: Object.keys(packages).length,
    };
}

function packageSummary(result, lockfileResult, relDir) {
    if (!result.ok) {
        return {
            path: `${relDir}/package.json`,
            available: false,
            error: result.error,
            lockfile: lockfileSummary(lockfileResult),
        };
    }

    const pkg = result.data;
    return {
        path: `${relDir}/package.json`,
        available: true,
        name: pkg.name ?? null,
        version: pkg.version ?? null,
        type: pkg.type ?? null,
        engines: pkg.engines ?? {},
        files: Array.isArray(pkg.files) ? pkg.files : [],
        binNames: pkg.bin && typeof pkg.bin === "object" ? Object.keys(pkg.bin).sort() : [],
        exportNames:
            pkg.exports && typeof pkg.exports === "object" ? Object.keys(pkg.exports).sort() : [],
        scriptNames:
            pkg.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts).sort() : [],
        prepublishOnly:
            pkg.scripts && typeof pkg.scripts.prepublishOnly === "string"
                ? pkg.scripts.prepublishOnly
                : null,
        publishConfigPresent: Boolean(pkg.publishConfig),
        lockfile: lockfileSummary(lockfileResult),
    };
}

function summarizeProductSurface(result) {
    if (!result.ok) {
        return {
            available: false,
            path: result.path,
            error: result.error,
        };
    }

    const surface = result.data;
    return {
        available: true,
        path: result.path,
        schemaVersion: surface.schemaVersion ?? null,
        generatedAt: surface.generatedAt ?? null,
        packageCount: Array.isArray(surface.packages)
            ? surface.packages.length
            : typeof surface.packages === "object" && surface.packages !== null
              ? Object.keys(surface.packages).length
              : null,
        cliCommandCount: Array.isArray(surface.cli?.commands) ? surface.cli.commands.length : null,
        mcpToolCount: Array.isArray(surface.mcp?.tools) ? surface.mcp.tools.length : null,
        workflowCount: Array.isArray(surface.mcp?.workflowTools)
            ? surface.mcp.workflowTools.length
            : null,
        docsCount: Array.isArray(surface.docs) ? surface.docs.length : null,
    };
}

function envShape() {
    const setVariableNames = knownEnvNames.filter((name) =>
        Object.prototype.hasOwnProperty.call(process.env, name),
    );

    return {
        knownVariableNames: knownEnvNames,
        setVariableNames,
        unsetVariableNames: knownEnvNames.filter((name) => !setVariableNames.includes(name)),
        envValuesCaptured: false,
        secretsCaptured: false,
        workspaceIdsCaptured: false,
        note: "Only variable names are captured. Values are never read into the bundle.",
    };
}

export async function buildBundle() {
    const [
        wrapperPkg,
        cliPkg,
        mcpPkg,
        rootLockfile,
        productSurface,
        contract,
        envContract,
        errorCodes,
        riskStatus,
        contractInventory,
    ] =
        await Promise.all([
            readJson("wrapper/package.json"),
            readJson("cli/package.json"),
            readJson("mcp/package.json"),
            readJson("package-lock.json"),
            readJson("docs/product-surface.json"),
            readJson("docs/support-bundle-contract.json"),
            readJson("docs/env-contract.json"),
            readJson("docs/error-codes.json"),
            buildRiskStatusReport({ status: "all" }),
            buildContractInventoryReport(),
        ]);

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        generator: {
            path: "scripts/create-support-bundle.mjs",
            network: "none",
            commandsExecuted: [],
            readsPackageMetadataOnly: true,
        },
        runtime: {
            node: process.versions.node,
            platform: process.platform,
            arch: process.arch,
            osRelease: os.release(),
            repoRootBasename: path.basename(root),
            cwdBasename: path.basename(process.cwd()),
            cwdInsideRepo:
                process.cwd() === root || path.relative(root, process.cwd()).startsWith("..") === false,
        },
        packages: [
            packageSummary(wrapperPkg, rootLockfile, "wrapper"),
            packageSummary(cliPkg, rootLockfile, "cli"),
            packageSummary(mcpPkg, rootLockfile, "mcp"),
        ],
        productSurface: summarizeProductSurface(productSurface),
        diagnostics: diagnosticsSurfaces,
        readinessContext: {
            network: "none",
            commandsExecuted: [],
            reportsCaptured: [
                "risk-status",
                "contract-inventory",
            ],
            riskStatus: {
                riskRoutingSummary: riskStatus.riskRoutingSummary,
                readinessBlockingRiskIds: riskStatus.readinessBlockingRiskIds,
                nonBlockingOpenOrProvisionalRiskIds: riskStatus.nonBlockingOpenOrProvisionalRiskIds,
            },
            contractInventory: {
                inventoryInvariantFailures: contractInventory.counts?.inventoryInvariantFailures ?? null,
                orderedProofChainCoverage: contractInventory.orderedProofChainCoverage,
            },
        },
        environmentShape: envShape(),
        safeCommandHints,
        liveBoundary: {
            liveProofIncluded: false,
            allowedWorkspaceType: "sacrificial sandbox only",
            customerWorkspaceAllowed: false,
            cleanupProofRequiredForLiveClaims: true,
        },
        redaction: {
            envValuesCaptured: false,
            secretsCaptured: false,
            workspaceIdsCaptured: false,
            rawLogsCaptured: false,
            rawProbeCapturesCaptured: false,
            rawHttpPayloadsCaptured: false,
            browserCookiesCaptured: false,
            shellHistoryCaptured: false,
            localDotEnvFilesCaptured: false,
        },
        localContracts: {
            supportBundle: {
                path: contract.path,
                available: contract.ok,
                schemaVersion: contract.ok ? contract.data.schemaVersion ?? null : null,
            },
            envContract: {
                path: envContract.path,
                available: envContract.ok,
                knownClockifyVariables: envContract.ok
                    ? knownEnvNames.filter((name) => JSON.stringify(envContract.data).includes(name))
                    : [],
            },
            errorCodes: {
                path: errorCodes.path,
                available: errorCodes.ok,
                count: errorCodes.ok && Array.isArray(errorCodes.data.codes) ? errorCodes.data.codes.length : null,
            },
        },
        escalationTemplateFields: contract.ok ? contract.data.bundleFields ?? [] : [],
        operatorNotes: [
            "Review this JSON before attaching it to an issue, chat, or handoff.",
            "Add sanitized receipts manually if needed; do not paste token values or production payloads.",
            "Run live gates only against a sacrificial sandbox and keep final cleanup receipts.",
        ],
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const bundle = await buildBundle();
    const json = JSON.stringify(bundle, null, options.pretty ? 2 : 0);

    if (options.output) {
        await mkdir(path.dirname(options.output), { recursive: true });
        await writeFile(options.output, `${json}\n`, "utf8");
        console.log(`Wrote redacted support bundle to ${options.output}`);
    } else {
        console.log(json);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(usage());
        process.exit(2);
    }
}
