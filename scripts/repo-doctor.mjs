#!/usr/bin/env node
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const sensitiveEnvNames = [
    "CLOCKIFY_API_KEY",
    "CLOCKIFY_ADDON_TOKEN",
    "CLOCKIFY_WORKSPACE_ID",
    "CLOCKIFY_BASE_URL",
    "NPM_TOKEN",
    "GITHUB_TOKEN",
];

function usage() {
    return [
        "Usage: node scripts/repo-doctor.mjs [--compact]",
        "",
        "Runs a no-network, read-only repo shape check.",
        "Does not run git, npm, codegen, tests, builds, or Clockify API calls.",
    ].join("\n");
}

function parseArgs(argv) {
    const options = { pretty: true };
    for (const arg of argv) {
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        if (arg === "--compact") {
            options.pretty = false;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function exists(relPath) {
    try {
        await access(path.join(root, relPath));
        return true;
    } catch {
        return false;
    }
}

async function readText(relPath) {
    return readFile(path.join(root, relPath), "utf8");
}

async function readJson(relPath) {
    return JSON.parse(await readText(relPath));
}

async function packageDefinitions() {
    const contractPath = "docs/developer-environment-contract.json";
    if (!(await exists(contractPath))) {
        return {
            packages: [],
            failure: check("developer-environment.package-contract", "fail", `${contractPath} is missing`),
        };
    }

    try {
        const contract = await readJson(contractPath);
        if (!Array.isArray(contract.packages)) {
            return {
                packages: [],
                failure: check(
                    "developer-environment.package-contract",
                    "fail",
                    `${contractPath} packages must be an array`,
                ),
            };
        }
        return { packages: contract.packages };
    } catch (error) {
        return {
            packages: [],
            failure: check(
                "developer-environment.package-contract",
                "fail",
                `${contractPath} could not be read`,
                { error: error instanceof Error ? error.message : String(error) },
            ),
        };
    }
}

function check(id, status, message, details = {}) {
    return { id, status, message, details };
}

function nodeMajor() {
    return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
}

async function packageChecks(pkg) {
    const checks = [];
    if (!(await exists(pkg.manifest))) {
        checks.push(check(`${pkg.id}.manifest`, "fail", `${pkg.manifest} is missing`));
        return checks;
    }

    const manifest = await readJson(pkg.manifest);
    checks.push(check(`${pkg.id}.manifest`, "pass", `${pkg.manifest} exists`));

    checks.push(
        check(
            `${pkg.id}.lockfile`,
            (await exists(pkg.lockfile)) ? "pass" : "fail",
            `${pkg.lockfile} ${await exists(pkg.lockfile) ? "exists" : "is missing"}`,
        ),
    );

    checks.push(
        check(
            `${pkg.id}.engine`,
            manifest.engines?.node === pkg.engine ? "pass" : "fail",
            `${pkg.id} engines.node is ${manifest.engines?.node ?? "<missing>"}`,
            { expected: pkg.engine },
        ),
    );

    for (const script of pkg.requiredScripts) {
        checks.push(
            check(
                `${pkg.id}.script.${script}`,
                typeof manifest.scripts?.[script] === "string" ? "pass" : "fail",
                `${pkg.id} script ${script} ${typeof manifest.scripts?.[script] === "string" ? "exists" : "is missing"}`,
            ),
        );
    }

    for (const [script, expectedCommand] of Object.entries(pkg.requiredScriptValues ?? {})) {
        const actualCommand = manifest.scripts?.[script];
        checks.push(
            check(
                `${pkg.id}.script.${script}.command`,
                actualCommand === expectedCommand ? "pass" : "fail",
                `${pkg.id} script ${script} command ${actualCommand === expectedCommand ? "matches" : "does not match"} expected shape`,
                { expected: expectedCommand, actual: actualCommand },
            ),
        );
    }

    return checks;
}

export async function buildReport() {
    const checks = [];
    const major = nodeMajor();
    const minor = Number.parseInt(process.versions.node.split(".")[1] ?? "0", 10);

    checks.push(
        check("node.floor", major > 22 || (major === 22 && minor >= 13) ? "pass" : "fail", `Node.js ${process.versions.node}`, {
            expected: ">=22.13.0",
        }),
    );

    checks.push(
        check("root.package-json", (await exists("package.json")) ? "pass" : "fail", "Root package.json exists"),
    );
    checks.push(
        check(
            "root.package-lock",
            (await exists("package-lock.json")) ? "pass" : "fail",
            "Root package-lock.json exists",
        ),
    );
    if (await exists("package.json")) {
        const rootManifest = await readJson("package.json");
        const workspaces = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : [];
        for (const workspace of ["wrapper", "cli", "mcp"]) {
            checks.push(
                check(
                    `root.workspace.${workspace}`,
                    workspaces.includes(workspace) ? "pass" : "fail",
                    `Root workspaces ${workspaces.includes(workspace) ? "include" : "must include"} ${workspace}`,
                ),
            );
        }
    }

    const configuredPackages = await packageDefinitions();
    if (configuredPackages.failure) checks.push(configuredPackages.failure);
    for (const pkg of configuredPackages.packages) checks.push(...(await packageChecks(pkg)));

    const localGenerator = (await exists("scripts/generate-sdk-from-openapi.mjs"))
        ? await readText("scripts/generate-sdk-from-openapi.mjs")
        : "";
    const localGeneratorConstants = (await exists("scripts/sdk-codegen/constants.mjs"))
        ? await readText("scripts/sdk-codegen/constants.mjs")
        : "";
    const localGeneratorSurface = `${localGenerator}\n${localGeneratorConstants}`;

    checks.push(
        check(
            "codegen.local-generator",
            localGeneratorSurface.includes("spec/corrected/clockify.corrected.openapi.yaml") &&
                localGeneratorSurface.includes("output/ts-sdk")
                ? "pass"
                : "fail",
            "Local generator should read the corrected OpenAPI snapshot and emit output/ts-sdk",
        ),
    );
    checks.push(
        check(
            "codegen.input-openapi",
            (await exists("spec/corrected/clockify.corrected.openapi.yaml")) ? "pass" : "fail",
            "Corrected OpenAPI snapshot exists",
        ),
    );
    checks.push(
        check(
            "codegen.sync-script",
            (await exists("wrapper/scripts/sync-sdk.sh")) ? "pass" : "fail",
            "Wrapper sync script exists",
        ),
    );

    const goclmcpPath = path.resolve(root, "../GOCLMCP");
    let goclmcpStatus = "warn";
    try {
        const sibling = await stat(goclmcpPath);
        goclmcpStatus = sibling.isDirectory() ? "pass" : "fail";
    } catch {
        goclmcpStatus = "warn";
    }
    checks.push(
        check(
            "goclmcp.sibling",
            goclmcpStatus,
            "../GOCLMCP is required for canonical OpenAPI regeneration and full drift proof",
            { expectedPath: "../GOCLMCP" },
        ),
    );

    checks.push(
        check(
            "generated.wrapper-src",
            (await exists("wrapper/src")) ? "pass" : "warn",
            "wrapper/src is generated by wrapper npm run sync and may be absent before setup",
        ),
    );
    checks.push(
        check(
            "generated.output-ts-sdk",
            (await exists("output/ts-sdk")) ? "pass" : "warn",
            "output/ts-sdk is generated locally and may be absent before regeneration",
        ),
    );

    const summary = {
        pass: checks.filter((entry) => entry.status === "pass").length,
        warn: checks.filter((entry) => entry.status === "warn").length,
        fail: checks.filter((entry) => entry.status === "fail").length,
    };

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        ok: summary.fail === 0,
        status: summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass",
        summary,
        repo: {
            rootBasename: path.basename(root),
            packageModel: "npm-workspaces",
            rootPackageJsonAllowed: true,
            network: "none",
            commandsExecuted: [],
        },
        environmentShape: {
            sensitiveVariableNamesSet: sensitiveEnvNames.filter((name) =>
                Object.prototype.hasOwnProperty.call(process.env, name),
            ),
            envValuesCaptured: false,
            secretsCaptured: false,
            workspaceIdsCaptured: false,
        },
        checks,
        next:
            summary.fail > 0
                ? ["Fix failed repo-shape checks before running heavier gates."]
                : summary.warn > 0
                  ? ["Run package setup or GOCLMCP/local generation only if that surface is needed."]
                  : ["Environment shape is ready for focused package gates."],
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildReport();
    console.log(JSON.stringify(report, null, options.pretty ? 2 : 0));
    if (report.summary.fail > 0) process.exit(1);
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
