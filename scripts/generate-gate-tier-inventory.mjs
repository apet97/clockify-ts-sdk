#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_FILE = path.resolve(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.dirname(THIS_FILE), "..");

export const DEFAULT_BOUNDS = Object.freeze({
    maxDepth: 32,
    maxTargetVisits: 12_000,
    maxRecipeLines: 40_000,
    maxCommandCharacters: 2_000_000,
    maxNpmScripts: 2_000,
    maxLiteralConsumersPerTarget: 120,
});

const TARGET_PATTERN = /^[A-Za-z0-9_.+@/-]+$/;
const MAKE_TARGET_PATTERN = /^[A-Za-z0-9_.+@/-]+$/;
const CONNECTORS = new Set(["&&", "||", ";", "|"]);
const PACKAGE_DIRS = ["wrapper", "cli", "mcp"];
const TIER_DECISION_TARGETS = {
    pr_blocking: [
        "generated-edit-check",
        "openapi-evidence",
        "upstream-drift",
        "live-evidence-currentness",
        "service-routing-matrix",
        "official-openapi-drift",
        "operation-parity-drift",
        "generator-config",
        "generator-independence",
        "generator-comparison",
        "doc-correctness-anchor",
        "generator-portability",
        "package-contract",
        "examples-contract",
        "examples-matrix",
        "snippet-safety",
        "snippet-method-parity",
        "snippet-compile",
        "runtime-support",
        "env-contract",
        "config-precedence",
        "sdk-public-api",
        "sdk-runtime-contract",
        "compatibility-contract",
        "observability",
        "diagnostics",
        "mcp-contract",
        "mcp-agent-ux",
        "cli-contract",
        "cli-write-safety",
        "mock-contract",
        "replay-fixtures",
        "cassettes-run",
        "fixture-mock-parity",
        "schema-quality",
        "product-surface-drift",
        "openapi-operations-drift",
        "secret-hygiene",
        "data-handling",
        "security-threat-model",
        "supply-chain",
        "dependency-boundary",
        "dependency-license",
        "live-safety",
        "test-data-lifecycle",
        "mcp-write-safety-run",
        "mutation-safety",
        "version-policy",
        "tag-hygiene",
        "version-consistency",
        "release-support-contract",
        "release-readiness",
        "ci-contract",
        "changelog-drift",
        "user-docs",
        "docs-quality",
        "error-docs-drift",
        "error-registry",
        "troubleshooting-drift",
        "readme-tables-drift",
        "docs-index-drift",
        "docs-drift",
    ],
    release_blocking: [
        "operation-coverage-run",
        "breaking-change-review-run",
        "consumer-cast-budget-run",
    ],
    scheduled_governance: [
        "decision-records",
        "contract-inventory",
        "workflow-cookbook",
        "acceptance-scenarios",
        "naming-taxonomy",
        "change-impact",
        "support-bundle",
        "issue-intake",
        "risk-register",
        "axioms-contract",
        "agent-handoff",
        "agent-tasks",
        "developer-environment",
        "operator-toolbox",
        "operator-onboarding",
        "api-docs",
        "test-matrix",
        "maintenance-playbook",
        "enterprise-audit",
        "docs-counts",
        "conformance-drift",
        "aggregate-gates",
    ],
};
const TIER_DECISION_RATIONALES = {
    pr_blocking:
        "Keep PR-blocking: this directly protects shipped behavior, generated API truth, package compatibility, security, documentation correctness, or release safety.",
    release_blocking:
        "Move to release-blocking proof: this is expensive compatibility/coverage proof that remains required before release but is not ordinary PR feedback.",
    scheduled_governance:
        "Move to scheduled governance: this maintains planning, inventory, reporting, or agent/process topology and does not directly validate shipped behavior on every PR.",
};
const DECISION_OVERRIDES = Object.fromEntries(
    Object.entries(TIER_DECISION_TARGETS).flatMap(([proposedTier, targets]) =>
        targets.map((target) => [
            target,
            { proposedTier, rationale: TIER_DECISION_RATIONALES[proposedTier] },
        ]),
    ),
);
const GENERATED_OUTPUTS = new Set([
    "docs/gate-tier-inventory.json",
    "docs/gate-tier-inventory.md",
    "scripts/generate-gate-tier-inventory.mjs",
    "scripts/generate-gate-tier-inventory.test.mjs",
]);

function stripComment(value) {
    let quote = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (char === "\\") {
            index += 1;
            continue;
        }
        if (quote != null) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            continue;
        }
        if (char === "#") return value.slice(0, index);
    }
    return value;
}

function splitInlineRecipe(value) {
    let quote = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (char === "\\") {
            index += 1;
            continue;
        }
        if (quote != null) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            continue;
        }
        if (char === ";") return [value.slice(0, index), value.slice(index + 1)];
    }
    return [value, null];
}

function joinMakeContinuations(lines) {
    const logical = [];
    let pending = null;
    let startLine = null;

    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index];
        if (raw.startsWith("\t")) {
            logical.push({ kind: "recipe", line: index + 1, text: raw.slice(1) });
            continue;
        }

        const source = pending == null ? raw : `${pending}${raw.trimStart()}`;
        const sourceLine = startLine ?? index + 1;
        if (source.endsWith("\\")) {
            pending = `${source.slice(0, -1)} `;
            startLine = sourceLine;
            continue;
        }
        pending = null;
        startLine = null;
        logical.push({ kind: "source", line: sourceLine, text: source });
    }

    if (pending != null) logical.push({ kind: "source", line: startLine, text: pending.trimEnd() });
    return logical;
}

function splitWords(value) {
    return value.trim() === "" ? [] : value.trim().split(/\s+/).filter(Boolean);
}

/**
 * Parse the small Make grammar used by this repository.
 *
 * The parser intentionally keeps all definitions rather than applying GNU
 * Make's merge semantics. Duplicate definitions are useful evidence when a
 * gate is accidentally reintroduced, and the graph walker can still use the
 * first definition as the stable source of prerequisites and recipes.
 */
export function parseMakefileGraph(makefileText, bounds = {}) {
    if (typeof makefileText !== "string") throw new TypeError("Makefile text must be a string");
    const maxRecipeLines = bounds.maxRecipeLines ?? DEFAULT_BOUNDS.maxRecipeLines;
    const rules = new Map();
    const definitions = new Map();
    const phony = new Set();
    const failures = [];
    let activeTargets = [];
    let recipeLines = 0;

    const defineRule = (source, line) => {
        const text = stripComment(source).trimEnd();
        if (text.trim() === "" || text.trimStart().startsWith("#")) {
            activeTargets = [];
            return;
        }

        const colon = text.indexOf(":");
        if (colon <= 0 || text.slice(0, colon).includes("=")) {
            activeTargets = [];
            return;
        }

        const rawNames = text.slice(0, colon).trim();
        const [rawPrerequisites, inlineRecipe] = splitInlineRecipe(text.slice(colon + 1));
        const names = splitWords(rawNames);
        const prerequisites = splitWords(rawPrerequisites);
        if (names.length === 0) {
            activeTargets = [];
            return;
        }

        if (names[0] === ".PHONY") {
            for (const prerequisite of prerequisites) phony.add(prerequisite);
            activeTargets = [];
            return;
        }

        const invalid = names.filter((name) => !MAKE_TARGET_PATTERN.test(name));
        if (invalid.length > 0) {
            failures.push(`line ${line}: unsupported target name(s): ${invalid.join(", ")}`);
            activeTargets = [];
            return;
        }

        for (const name of names) {
            const definition = {
                name,
                line,
                prerequisites: [...prerequisites],
                recipes: [],
                inlineRecipes: inlineRecipe == null || inlineRecipe.trim() === "" ? [] : [inlineRecipe.trim()],
            };
            const list = definitions.get(name) ?? [];
            list.push(definition);
            definitions.set(name, list);
            if (!rules.has(name)) rules.set(name, definition);
        }
        activeTargets = names;
    };

    for (const record of joinMakeContinuations(makefileText.split("\n"))) {
        if (record.kind === "recipe") {
            recipeLines += 1;
            if (recipeLines > maxRecipeLines) {
                failures.push(`recipe lines exceed ${maxRecipeLines} bound`);
                break;
            }
            const recipe = record.text;
            const definition = activeTargets.length > 0 ? rules.get(activeTargets[0]) : null;
            if (definition != null) {
                for (const target of activeTargets) rules.get(target)?.recipes.push(recipe);
            }
            continue;
        }
        defineRule(record.text, record.line);
    }

    return { rules, definitions, phony, failures };
}

function tokenizeShell(value) {
    const tokens = [];
    let token = "";
    let quote = null;
    const push = () => {
        if (token !== "") tokens.push(token);
        token = "";
    };

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote != null) {
            if (char === quote) quote = null;
            else if (char === "\\" && quote === '"' && index + 1 < value.length) token += value[++index];
            else token += char;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            continue;
        }
        if (char === "\\" && index + 1 < value.length) {
            token += value[++index];
            continue;
        }
        const pair = value.slice(index, index + 2);
        if (pair === "&&" || pair === "||") {
            push();
            tokens.push(pair);
            index += 1;
            continue;
        }
        if (char === ";" || char === "|") {
            push();
            tokens.push(char);
            continue;
        }
        if (/\s/.test(char)) {
            push();
            continue;
        }
        token += char;
    }
    push();
    return { tokens, unterminatedQuote: quote };
}

function shellSegments(value) {
    const { tokens, unterminatedQuote } = tokenizeShell(value);
    const segments = [];
    let current = [];
    for (const token of tokens) {
        if (CONNECTORS.has(token)) {
            if (current.length > 0) segments.push(current);
            current = [];
        } else {
            current.push(token);
        }
    }
    if (current.length > 0) segments.push(current);
    return { segments, unterminatedQuote };
}

function executableName(value) {
    return path.posix.basename(String(value ?? "").replaceAll("\\", "/"));
}

function isMakeToken(value) {
    return ["make", "gmake", "$(MAKE)", "${MAKE}", "$MAKE"].includes(executableName(value));
}

function parseMakeArguments(args, baseDirectory) {
    let directory = baseDirectory;
    const targets = [];
    const failures = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (["-k", "-r", "-R", "-s", "-B", "--keep-going", "--no-print-directory", "--silent"].includes(arg)) continue;
        if (arg === "-C" || arg === "--directory") {
            const value = args[++index];
            if (value == null || value === "" || value.includes("$")) failures.push(`${arg} requires a literal directory`);
            else directory = path.posix.normalize(path.posix.join(directory, value));
            continue;
        }
        if (arg.startsWith("-C") && arg.length > 2) {
            directory = path.posix.normalize(path.posix.join(directory, arg.slice(2)));
            continue;
        }
        if (arg.startsWith("--directory=")) {
            directory = path.posix.normalize(path.posix.join(directory, arg.slice("--directory=".length)));
            continue;
        }
        if (arg.startsWith("-")) continue;
        if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(arg)) continue;
        if (!TARGET_PATTERN.test(arg) || arg.includes("%")) failures.push(`unsupported make target ${arg}`);
        else targets.push(arg);
    }
    if (targets.length === 0) failures.push("recursive make call has no explicit target");
    return { directory: directory === "" ? "." : directory, targets, failures };
}

function findCommandIndex(tokens, predicate) {
    return tokens.findIndex(predicate);
}

export function parseRecursiveMakeCalls(command, directory) {
    const { segments } = shellSegments(command);
    const calls = [];
    let workingDirectory = directory;
    for (const segment of segments) {
        if (segment[0] === "cd" && segment[1] != null) {
            workingDirectory = resolveRelativeDirectory(workingDirectory, segment[1]);
        }
        const index = findCommandIndex(segment, isMakeToken);
        if (index < 0) continue;
        const prefix = segment.slice(0, index);
        let callDirectory = workingDirectory;
        const cdIndex = prefix.findIndex((value) => value === "cd");
        if (cdIndex >= 0 && prefix[cdIndex + 1] != null) {
            callDirectory = path.posix.normalize(path.posix.join(callDirectory, prefix[cdIndex + 1]));
        }
        const parsed = parseMakeArguments(segment.slice(index + 1), callDirectory);
        calls.push({
            command,
            directory: parsed.directory,
            targets: parsed.targets,
            failures: parsed.failures,
        });
    }
    return calls;
}

function resolveRelativeDirectory(baseDirectory, candidate) {
    if (candidate == null || candidate === "") return baseDirectory;
    if (candidate.startsWith("/")) return baseDirectory;
    return path.posix.normalize(path.posix.join(baseDirectory, candidate));
}

function packageNameFromManifest(manifest, relativeDirectory) {
    return typeof manifest?.name === "string" && manifest.name !== "" ? manifest.name : relativeDirectory;
}

function loadPackageCatalog(rootDir) {
    const packages = new Map();
    const add = (relativeDirectory) => {
        const normalized = relativeDirectory === "" ? "." : path.posix.normalize(relativeDirectory);
        const manifestPath = path.join(rootDir, normalized, "package.json");
        if (!fs.existsSync(manifestPath)) return;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const entry = {
            directory: normalized,
            path: manifestPath,
            manifest,
            name: packageNameFromManifest(manifest, normalized),
        };
        packages.set(normalized, entry);
        packages.set(entry.name, entry);
    };

    add(".");
    const rootPackage = packages.get(".")?.manifest ?? {};
    const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : PACKAGE_DIRS;
    for (const workspace of workspaces) {
        if (typeof workspace !== "string") continue;
        const literal = workspace.replace(/\/\*$/, "");
        if (literal !== workspace || workspace.includes("*")) {
            for (const directory of PACKAGE_DIRS) add(directory);
        } else {
            add(literal);
        }
    }
    for (const directory of PACKAGE_DIRS) add(directory);
    return packages;
}

function packageForSelection(catalog, directory, workspace, prefix) {
    if (workspace != null) {
        const selected = catalog.get(workspace);
        if (selected != null) return selected;
    }
    if (prefix != null) {
        const selected = catalog.get(path.posix.normalize(prefix));
        if (selected != null) return selected;
    }
    const selected = catalog.get(path.posix.normalize(directory));
    return selected ?? catalog.get(".") ?? null;
}

function parseNpmCommand(tokens) {
    const npmIndex = tokens.findIndex((token) => executableName(token) === "npm");
    if (npmIndex < 0) return null;
    const args = tokens.slice(npmIndex + 1);
    let workspace = null;
    let prefix = null;
    const positionals = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "-w" || arg === "--workspace") workspace = args[++index] ?? null;
        else if (arg.startsWith("-w=")) workspace = arg.slice(3);
        else if (arg.startsWith("--workspace=")) workspace = arg.slice("--workspace=".length);
        else if (arg === "--prefix" || arg === "-C") prefix = args[++index] ?? null;
        else if (arg.startsWith("--prefix=")) prefix = arg.slice("--prefix=".length);
        else if (arg.startsWith("-C=")) prefix = arg.slice(3);
        else if (!arg.startsWith("-")) positionals.push(arg);
    }
    const subcommand = positionals[0] ?? null;
    if (subcommand === "run" || subcommand === "run-script") {
        return { workspace, prefix, script: positionals[1] ?? null };
    }
    if (["test", "t", "tst"].includes(subcommand)) return { workspace, prefix, script: "test" };
    return null;
}

function relativePath(rootDir, absolutePath) {
    const relative = path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
    return relative === "" ? "." : relative;
}

function collectFiles(rootDir, relativeDirectory, predicate, limit = 1_000) {
    const results = [];
    const absoluteRoot = path.join(rootDir, relativeDirectory);
    if (!fs.existsSync(absoluteRoot)) return results;
    const walk = (absoluteDirectory) => {
        if (results.length >= limit) return;
        for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (results.length >= limit) return;
            const absolute = path.join(absoluteDirectory, entry.name);
            if (entry.isDirectory()) walk(absolute);
            else if (predicate(entry.name, absolute)) results.push(relativePath(rootDir, absolute));
        }
    };
    walk(absoluteRoot);
    return results;
}

function pathFromToken(rootDir, directory, token) {
    const cleaned = token.replace(/^[('"`]+|[),;'"`]+$/g, "");
    if (!cleaned || cleaned.startsWith("-") || cleaned.includes("$")) return null;
    if (!/\.(?:test|spec)\.(?:m?js|c?js|ts|tsx)$/.test(cleaned)) return null;
    const absolute = path.resolve(rootDir, directory, cleaned);
    const relative = relativePath(rootDir, absolute);
    if (relative.startsWith("../") || relative === "..") return null;
    return relative;
}

function collectTestsFromCommand(rootDir, directory, command, tests) {
    const { segments } = shellSegments(command);
    let workingDirectory = directory;
    for (const segment of segments) {
        if (segment[0] === "cd" && segment[1] != null) {
            workingDirectory = resolveRelativeDirectory(workingDirectory, segment[1]);
        }
        for (const token of segment) {
            const testPath = pathFromToken(rootDir, workingDirectory, token);
            if (testPath != null) tests.add(testPath);
        }
    }
}

function scanLiteralConsumers(rootDir, target, bounds) {
    const files = [];
    const addFiles = (relativeDirectory, predicate) => {
        if (!fs.existsSync(path.join(rootDir, relativeDirectory))) return;
        files.push(...collectFiles(rootDir, relativeDirectory, predicate, 5_000));
    };
    addFiles("scripts", (name) => name.endsWith(".mjs") || name.endsWith(".js"));
    addFiles("docs", (name) => name.endsWith(".json") || name.endsWith(".md"));
    addFiles(".github/workflows", (name) => name.endsWith(".yml") || name.endsWith(".yaml"));
    files.push("Makefile");

    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenPattern = new RegExp(`(^|[^A-Za-z0-9_.+@/-])${escaped}(?=$|[^A-Za-z0-9_.+@/-])`);
    const topologyPattern = /Makefile|prerequisite|aggregate|literal|topolog|wiring|exact[- ]once|verify-plan|contract-gates|perfect-full|reachability/i;
    const consumers = [];
    for (const relative of [...new Set(files)].sort()) {
        if (GENERATED_OUTPUTS.has(relative)) continue;
        const absolute = path.join(rootDir, relative);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
        const lines = fs.readFileSync(absolute, "utf8").split("\n");
        for (const [index, line] of lines.entries()) {
            if (tokenPattern.test(line) && topologyPattern.test(line)) {
                consumers.push(`${relative}:${index + 1}`);
            }
        }
    }
    return consumers.slice(0, bounds.maxLiteralConsumersPerTarget);
}

function makefileForDirectory(rootDir, directory, cache) {
    const normalized = directory === "" ? "." : path.posix.normalize(directory);
    if (cache.has(normalized)) return cache.get(normalized);
    const absolute = path.resolve(rootDir, normalized, "Makefile");
    const relative = relativePath(rootDir, absolute);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
        cache.set(normalized, null);
        return null;
    }
    const model = parseMakefileGraph(fs.readFileSync(absolute, "utf8"));
    model.sourcePath = relative;
    cache.set(normalized, model);
    return model;
}

function nodeKey(directory, target) {
    return directory === "." ? target : `${directory}::${target}`;
}

function targetFromNodeKey(key) {
    const separator = key.lastIndexOf("::");
    if (separator < 0) return { directory: ".", target: key };
    return { directory: key.slice(0, separator), target: key.slice(separator + 2) };
}

function collectReachability(rootDir, rootTarget, rootModel, bounds) {
    const makefileCache = new Map([[".", rootModel]]);
    const visited = new Set();
    const visiting = [];
    const transitive = new Set();
    const recursiveMakeCalls = [];
    const reachedCommands = [];
    const failures = [];
    let visits = 0;
    let recipeCharacters = 0;

    function walk(directory, target, depth) {
        if (depth > bounds.maxDepth) {
            failures.push(`target traversal depth exceeds ${bounds.maxDepth} at ${nodeKey(directory, target)}`);
            return;
        }
        const key = nodeKey(directory, target);
        if (visiting.includes(key)) {
            failures.push(`recursive target cycle: ${[...visiting, key].join(" -> ")}`);
            return;
        }
        if (visited.has(key)) return;
        visits += 1;
        if (visits > bounds.maxTargetVisits) {
            failures.push(`target traversal exceeds ${bounds.maxTargetVisits} visits`);
            return;
        }

        const model = makefileForDirectory(rootDir, directory, makefileCache);
        const definition = model?.rules.get(target);
        if (definition == null) return;
        visited.add(key);
        if (key !== rootTarget) transitive.add(key);
        visiting.push(key);

        const commands = [...definition.inlineRecipes, ...definition.recipes].map((value) => value.trim()).filter(Boolean);
        for (const command of commands) {
            recipeCharacters += command.length;
            if (recipeCharacters > bounds.maxCommandCharacters) {
                failures.push(`command source exceeds ${bounds.maxCommandCharacters} characters`);
                break;
            }
            reachedCommands.push({ directory, target: key, command });
            for (const call of parseRecursiveMakeCalls(command, directory)) {
                recursiveMakeCalls.push({ ...call, from: key });
                for (const recursiveTarget of call.targets) walk(call.directory, recursiveTarget, depth + 1);
            }
        }

        for (const prerequisite of definition.prerequisites) {
            if (model.rules.has(prerequisite)) walk(directory, prerequisite, depth + 1);
        }
        visiting.pop();
    }

    walk(".", rootTarget, 0);
    return {
        transitiveTargets: [...transitive].sort(),
        recursiveMakeCalls,
        reachedCommands,
        failures,
        visited,
    };
}

function collectNpmReachability(rootDir, reachedCommands, catalog, bounds) {
    const npmScripts = new Set();
    const npmCommands = [];
    const tests = new Set();
    const failures = [];
    const queue = [...reachedCommands];
    let cursor = 0;
    const seenCommands = new Set();

    const enqueueScript = (entry, script, from) => {
        const key = `${entry.directory}::${script}`;
        npmScripts.add(key);
        if (npmScripts.size > bounds.maxNpmScripts) {
            failures.push(`npm script traversal exceeds ${bounds.maxNpmScripts} scripts`);
            return;
        }
        if (seenCommands.has(`script:${key}`)) return;
        seenCommands.add(`script:${key}`);
        const source = entry.manifest?.scripts?.[script];
        if (typeof source !== "string") {
            failures.push(`${from}: npm script ${key} is not defined`);
            return;
        }
        npmCommands.push({ package: entry.directory, script, command: source });
        queue.push({ directory: entry.directory, target: key, command: source });
    };

    while (cursor < queue.length) {
        const item = queue[cursor++];
        const commandKey = `${item.directory}\0${item.command}`;
        if (seenCommands.has(commandKey)) continue;
        seenCommands.add(commandKey);
        collectTestsFromCommand(rootDir, item.directory, item.command, tests);
        let workingDirectory = item.directory;
        const { segments } = shellSegments(item.command);
        for (const segment of segments) {
            if (segment[0] === "cd" && segment[1] != null) {
                workingDirectory = resolveRelativeDirectory(workingDirectory, segment[1]);
            }
            const invocation = parseNpmCommand(segment);
            if (invocation == null || invocation.script == null) continue;
            const entry = packageForSelection(catalog, workingDirectory, invocation.workspace, invocation.prefix);
            if (entry == null) {
                failures.push(`${item.target}: npm package selection could not be resolved`);
                continue;
            }
            enqueueScript(entry, invocation.script, item.target);
        }
    }

    for (const entry of new Set(catalog.values())) {
        if (!entry?.manifest?.scripts) continue;
        for (const script of npmScripts) {
            const [directory, name] = script.split("::");
            if (directory !== entry.directory || !/^(?:test|test:coverage)$/.test(name)) continue;
            const packageTests = collectFiles(rootDir, entry.directory, (file) => /\.(?:test|spec)\.(?:m?js|c?js|ts|tsx)$/.test(file));
            for (const test of packageTests) tests.add(test);
        }
    }

    return {
        npmScripts: [...npmScripts].sort(),
        npmCommands,
        tests: [...tests].sort(),
        failures,
    };
}

function collectPathTokens(values) {
    const paths = new Set();
    const pattern = /(?:\.\.\/)?(?:docs|scripts|spec|wrapper|cli|mcp|output|reports|coverage)(?:\/[A-Za-z0-9_.@+/-]+)+/g;
    for (const value of values) {
        for (const match of String(value).matchAll(pattern)) {
            const candidate = match[0].replace(/[),;'"`]+$/g, "");
            if (candidate.includes("$") || candidate.includes("*")) continue;
            paths.add(candidate);
        }
    }
    return paths;
}

function collectCheckerSources(rootDir, entry, commands, tests) {
    const sources = new Set();
    if (entry?.checker) sources.add(entry.checker);
    const pattern = /(?:^|[\s'"`(])((?:scripts|wrapper|cli|mcp|\.github\/workflows)\/[A-Za-z0-9_.@+/-]+\.(?:mjs|js|ts|yml|yaml))(?:$|[\s'"`),;|])/g;
    for (const value of [...commands, ...tests]) {
        for (const match of String(value).matchAll(pattern)) sources.add(match[1]);
    }
    return [...sources].filter((source) => source.startsWith("../") || fs.existsSync(path.join(rootDir, source))).sort();
}

function collectPoliciesAndContracts(rootDir, entry, values) {
    const paths = new Set([...(entry?.policies ?? []), ...(entry?.contracts ?? [])]);
    const pattern = /(?:^|[\s'"`(])((?:docs)\/[A-Za-z0-9_.@+/-]+\.(?:json|md))(?:$|[\s'"`),;|])/g;
    for (const value of values) {
        for (const match of String(value).matchAll(pattern)) {
            const candidate = match[1];
            if (/(?:contract|policy|inventory|matrix|risk|README|readme)/i.test(candidate)) paths.add(candidate);
        }
    }
    return [...paths].filter((item) => fs.existsSync(path.join(rootDir, item))).sort();
}

function inferImpactClass(target, commands, policies) {
    const text = [target, ...commands, ...policies].join(" ").toLowerCase();
    const impact = new Set();
    if (/(?:security|secret|supply|dependency|data-handling|live-safety|write-safety|mutation|generated-edit)/.test(text)) impact.add("security");
    if (/(?:release|version|tag|changelog|package|publish|ci-contract|pack-)/.test(text)) impact.add("release");
    if (/(?:docs?|readme|troubleshoot|error|user-doc|api-doc|agent|operator|roadmap|claim|index|count|quality|contract|policy|risk|maintenance|decision|handoff|acceptance|workflow|naming|change-impact)/.test(text)) impact.add("governance");
    if (/(?:openapi|generator|schema|operation|sdk|cli|mcp|example|snippet|runtime|compatibility|replay|cassette|fixture|mock|consumer|config|env)/.test(text)) impact.add("product");
    if (impact.size === 0) impact.add("governance");
    return [...impact].sort();
}

function inferCostClass(target, commands, tests) {
    const text = [target, ...commands, ...tests].join(" ").toLowerCase();
    if (/(?:coverage|mutation|build-determinism|pack-smoke|performance|sdk-codegen|codegen|perfect-full|operation-coverage|mcp-tool-manifest|npm test|vitest|tsc)/.test(text)) return "high";
    if (/(?:build|npm run|node --test|test|drift|parity|schema|openapi|eslint|lint)/.test(text)) return "medium";
    return "low";
}

function inferNetwork(target, commands, npmCommands) {
    const text = [...commands, ...npmCommands.map((item) => item.command)].join(" ");
    return /(?:\bcurl\b|\bwget\b|\bfetch\b|npm\s+(?:view|publish|install|ci|pack)|\bgit\s+(?:fetch|clone|push|ls-remote)|\bgh\b|https?:\/\/|CLOCKIFY_API_KEY)/i.test(text) ||
        /^(?:official-openapi-fetch|openapi-source-lock|sync-locked-openapi)$/.test(target);
}

function inferLive(tests, commands, target) {
    const text = [target, ...commands, ...tests].join(" ");
    return /(?:sandbox\.test|run-live-proof|CLOCKIFY_API_KEY\s*=\s*[^'" ]+|perfect-live|liveMutation|live probe)/i.test(text);
}

function inferArtifacts(rootDir, target, commands, tests, policies) {
    const values = [target, ...commands, ...tests, ...policies];
    const artifacts = new Set();
    const text = values.join(" ");
    if (/docs\//.test(text) || /(?:docs|doc)-/.test(target)) artifacts.add("docs/**");
    if (/wrapper\/(?:dist|src)/.test(text) || /sdk|wrapper/.test(target)) artifacts.add("wrapper/dist/**");
    if (/cli\/(?:dist|src)/.test(text) || /cli/.test(target)) artifacts.add("cli/dist/**");
    if (/mcp\/(?:dist|src)/.test(text) || /mcp/.test(target)) artifacts.add("mcp/dist/**");
    if (/output\/ts-sdk|codegen/.test(text)) artifacts.add("output/ts-sdk/**");
    if (/coverage/.test(text)) artifacts.add("coverage/**");
    if (/reports\//.test(text)) artifacts.add("reports/**");
    if (/\.tgz|pack/.test(text)) artifacts.add("*.tgz");
    if (/\.mcpb|mcpb/.test(text)) artifacts.add("*.mcpb");
    if (artifacts.size === 0 && (rootDir != null || target !== "")) artifacts.add("none");
    return [...artifacts].sort();
}

function readContractInventory(rootDir) {
    const absolute = path.join(rootDir, "docs", "contract-inventory.json");
    if (!fs.existsSync(absolute)) return new Map();
    const document = JSON.parse(fs.readFileSync(absolute, "utf8"));
    return new Map((document.entries ?? []).filter((entry) => typeof entry?.target === "string").map((entry) => [entry.target, entry]));
}

function readDecisionBaseline(rootDir, model) {
    const absolute = path.join(rootDir, "docs", "gate-tier-inventory.json");
    if (!fs.existsSync(absolute)) return [];
    try {
        const document = JSON.parse(fs.readFileSync(absolute, "utf8"));
        const candidates = document.decisionPrerequisites;
        if (!Array.isArray(candidates) || candidates.length === 0) return [];
        if (candidates.some((target) => typeof target !== "string" || target.trim() === "")) return [];
        if (new Set(candidates).size !== candidates.length) return [];
        if (candidates.some((target) => !model.rules.has(target))) return [];
        return [...candidates];
    } catch {
        return [];
    }
}

function buildDuplicateOwners(rows) {
    const ownership = new Map();
    for (const row of rows) {
        const keys = [
            ...row.checkerSources.map((value) => `checker:${value}`),
            ...row.policyContracts.map((value) => `contract:${value}`),
        ];
        for (const key of keys) {
            const owners = ownership.get(key) ?? [];
            owners.push(row.target);
            ownership.set(key, owners);
        }
    }
    for (const row of rows) {
        const duplicate = new Set();
        for (const [key, owners] of ownership) {
            if (!key.startsWith("checker:") && !key.startsWith("contract:")) continue;
            if (!owners.includes(row.target) || owners.length < 2) continue;
            for (const owner of owners) if (owner !== row.target) duplicate.add(owner);
        }
        row.duplicateOwners = [...duplicate].sort();
    }
}

function jsonFor(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownCell(value) {
    if (Array.isArray(value)) return value.length === 0 ? "-" : value.map((item) => String(item).replaceAll("|", "\\|")).join(", ");
    if (value === true) return "yes";
    if (value === false || value == null || value === "") return "no";
    return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownFor(inventory) {
    const decisionRows = inventory.decisionRows?.length > 0 ? inventory.decisionRows : inventory.rows;
    const lines = [
        "<!-- Generated by scripts/generate-gate-tier-inventory.mjs. Run `make gate-tier-inventory` after changing the contract-gates topology. -->",
        "",
        "# Gate Tier Inventory",
        "",
        "This generated packet records both the active aggregate topology and the retained D4 leaf decision set. The leaf rows preserve the pre-C10 evidence while their proposed tiers are resolved by the approved conservative migration rules.",
        "",
        `Measured active aggregate prerequisite count: **${inventory.directPrerequisiteCount}** (derived from \`${inventory.source}\`). Retained D4 decision prerequisite count: **${inventory.decisionPrerequisiteCount ?? decisionRows.length}**.`,
        "",
        `Active topology rows: **${inventory.rows.length}**. Decision rows resolved: **${decisionRows.filter((row) => row.proposedTier !== "undecided").length}/${decisionRows.length}**.`,
        "",
        "| Target | Current tier | Proposed tier | Impact | Cost | Network | Live | Direct prerequisites | Transitive targets | Tests | Checker sources | Policy/contracts | Literal consumers | Duplicate owners |",
        "|---|---|---|---|---|---|---|---:|---:|---:|---|---|---:|---|",
    ];
    for (const row of decisionRows) {
        lines.push(
            `| \`${row.target}\` | ${markdownCell(row.currentTier)} | ${markdownCell(row.proposedTier)} | ${markdownCell(row.impactClass)} | ${markdownCell(row.costClass)} | ${markdownCell(row.network)} | ${markdownCell(row.live)} | ${row.directPrerequisites.length} | ${row.transitiveTargets.length} | ${row.tests.length} | ${markdownCell(row.checkerSources)} | ${markdownCell(row.policyContracts)} | ${row.literalTopologyConsumers.length} | ${markdownCell(row.duplicateOwners)} |`,
        );
    }
    lines.push(
        "",
        "## Active topology",
        "",
        `The active \`contract-gates\` root has ${inventory.rows.length} aggregate bundle prerequisites: ${inventory.directPrerequisites.map((target) => `\`${target}\``).join(", ")}.`,
        "",
        "## Review rules",
        "",
        "- Every retained D4 leaf has a proposed tier and rationale.",
        "- Product, security, package, compatibility, documentation-correctness, and release invariants require replacement evidence before moving out of PR blocking.",
        "- The inventory is evidence and topology, not proof that the proposed simplification is safe.",
    );
    return `${lines.join("\n")}\n`;
}

function makeRow({ rootDir, target, definition, reachability, npm, contractEntry, bounds, decision = null }) {
    const directCommands = [...definition.inlineRecipes, ...definition.recipes].map((value) => value.trim()).filter(Boolean);
    const allCommands = [...directCommands, ...reachability.reachedCommands.map((item) => item.command), ...npm.npmCommands.map((item) => item.command)];
    const allTests = npm.tests;
    const checkerSources = collectCheckerSources(rootDir, contractEntry, allCommands, allTests);
    const policyContracts = collectPoliciesAndContracts(rootDir, contractEntry, [...allCommands, ...checkerSources]);
    const evidence = new Set([`Makefile:${definition.line}`, ...checkerSources, ...policyContracts]);
    if (contractEntry != null) evidence.add("docs/contract-inventory.json");
    const recursiveCalls = reachability.recursiveMakeCalls.map((call) => ({
        from: call.from,
        command: call.command,
        directory: call.directory,
        targets: [...call.targets].sort(),
        failures: [...call.failures].sort(),
    }));
    const row = {
        target,
        currentTier: decision?.currentTier ?? "aggregate",
        proposedTier: decision?.proposedTier ?? "aggregate",
        rationale: decision?.rationale ?? "Aggregate topology node; leaf decisions are recorded in decisionRows.",
        impactClass: inferImpactClass(target, allCommands, policyContracts),
        invariant: contractEntry?.id
            ? `${contractEntry.id} is enforced by ${contractEntry.checker ?? `make ${target}`}`
            : `${target} target contract and reached proof commands`,
        directPrerequisites: [...definition.prerequisites],
        transitiveTargets: reachability.transitiveTargets,
        commands: directCommands,
        npmScripts: npm.npmScripts,
        tests: allTests,
        costClass: inferCostClass(target, allCommands, allTests),
        network: inferNetwork(target, allCommands, npm.npmCommands),
        live: inferLive(allTests, allCommands, target),
        artifacts: inferArtifacts(rootDir, target, allCommands, allTests, policyContracts),
        checkerSources,
        policyContracts,
        literalTopologyConsumers: scanLiteralConsumers(rootDir, target, bounds),
        duplicateOwners: [],
        recursiveMakeCalls: recursiveCalls,
        evidence: [...evidence].sort(),
    };
    return row;
}

export function buildInventory({ rootDir = ROOT, bounds = DEFAULT_BOUNDS } = {}) {
    const makefilePath = path.join(rootDir, "Makefile");
    if (!fs.existsSync(makefilePath)) throw new Error(`Makefile not found at ${makefilePath}`);
    const makefileText = fs.readFileSync(makefilePath, "utf8");
    const model = parseMakefileGraph(makefileText, bounds);
    if (model.failures.length > 0) throw new Error(`Makefile parse failed: ${model.failures.join("; ")}`);
    const rootDefinition = model.rules.get("contract-gates");
    if (rootDefinition == null) throw new Error("Makefile has no contract-gates target");
    const duplicateDefinitions = model.definitions.get("contract-gates") ?? [];
    if (duplicateDefinitions.length !== 1) throw new Error(`contract-gates must have one definition; found ${duplicateDefinitions.length}`);
    const measuredCount = rootDefinition.prerequisites.length;
    if (measuredCount !== rootDefinition.prerequisites.filter((value) => value.trim() !== "").length) {
        throw new Error("contract-gates direct prerequisite measurement contains an empty token");
    }

    const catalog = loadPackageCatalog(rootDir);
    const contractInventory = readContractInventory(rootDir);
    const boundsCopy = { ...DEFAULT_BOUNDS, ...bounds };
    const globalFailures = [];
    const collectRows = (targets, decisions = false) =>
        targets.map((target) => {
            if (!model.rules.has(target)) {
                globalFailures.push(`${decisions ? "decision" : "contract-gates"} target has no Make target: ${target}`);
            }
            const definition = model.rules.get(target) ?? {
                name: target,
                line: rootDefinition.line,
                prerequisites: [],
                recipes: [],
                inlineRecipes: [],
            };
            const reachability = collectReachability(rootDir, target, model, boundsCopy);
            const npm = collectNpmReachability(rootDir, reachability.reachedCommands, catalog, boundsCopy);
            globalFailures.push(...reachability.failures.map((failure) => `${target}: ${failure}`));
            globalFailures.push(...npm.failures.map((failure) => `${target}: ${failure}`));
            const override = decisions ? DECISION_OVERRIDES[target] : null;
            if (decisions && override == null) {
                globalFailures.push(`decision target has no resolved tier: ${target}`);
            }
            return makeRow({
                rootDir,
                target,
                definition,
                reachability,
                npm,
                contractEntry: contractInventory.get(target),
                bounds: boundsCopy,
                decision: decisions
                    ? {
                          currentTier: "pr_blocking",
                          proposedTier: override?.proposedTier ?? "undecided",
                          rationale: override?.rationale ?? "",
                      }
                    : null,
            });
        });
    const rows = collectRows(rootDefinition.prerequisites);
    const decisionPrerequisites = readDecisionBaseline(rootDir, model);
    const decisionRows = decisionPrerequisites.length > 0 ? collectRows(decisionPrerequisites, true) : [];
    if (globalFailures.length > 0) throw new Error(globalFailures.join("; "));

    buildDuplicateOwners(rows);
    if (decisionRows.length > 0) buildDuplicateOwners(decisionRows);
    const inventory = {
        schemaVersion: 1,
        purpose: "Generated contract-gates topology plus the complete D4 decision inventory retained across the C10 aggregate refactor.",
        generatedBy: "scripts/generate-gate-tier-inventory.mjs",
        source: "Makefile",
        rootTarget: "contract-gates",
        directPrerequisiteCount: measuredCount,
        directPrerequisites: rootDefinition.prerequisites,
        decisionPrerequisiteCount: decisionPrerequisites.length,
        decisionPrerequisites,
        duplicateDefinitions: (model.definitions.get("contract-gates") ?? []).map((definition) => definition.line),
        bounds: boundsCopy,
        rows,
        decisionRows,
    };
    if (inventory.directPrerequisiteCount !== inventory.directPrerequisites.length || inventory.rows.length !== inventory.directPrerequisiteCount) {
        throw new Error(
            `contract-gates prerequisite measurement mismatch: measured ${inventory.directPrerequisiteCount}, ` +
            `listed ${inventory.directPrerequisites.length}, rows ${inventory.rows.length}`,
        );
    }
    if (decisionPrerequisites.length > 0 && decisionRows.length !== decisionPrerequisites.length) {
        throw new Error(
            `D4 decision measurement mismatch: listed ${decisionPrerequisites.length}, rows ${decisionRows.length}`,
        );
    }
    return inventory;
}

export function validateInventory(inventory) {
    const failures = [];
    if (inventory?.schemaVersion !== 1) failures.push("schemaVersion must be 1");
    if (inventory?.rootTarget !== "contract-gates") failures.push("rootTarget must be contract-gates");
    if (!Number.isInteger(inventory?.directPrerequisiteCount)) failures.push("directPrerequisiteCount must be an integer");
    if (!Array.isArray(inventory?.directPrerequisites)) failures.push("directPrerequisites must be an array");
    if (!Array.isArray(inventory?.rows)) failures.push("rows must be an array");
    if (Array.isArray(inventory?.directPrerequisites) && inventory.directPrerequisiteCount !== inventory.directPrerequisites.length) {
        failures.push("directPrerequisiteCount must equal directPrerequisites.length");
    }
    if (Array.isArray(inventory?.rows) && inventory.rows.length !== inventory.directPrerequisiteCount) {
        failures.push("rows must cover every direct prerequisite");
    }
    const expected = new Set(inventory?.directPrerequisites ?? []);
    const seen = new Set();
    for (const [index, row] of (inventory?.rows ?? []).entries()) {
        const prefix = `rows[${index}]`;
        if (row?.target == null || !expected.has(row.target)) failures.push(`${prefix}.target is not a direct prerequisite`);
        if (seen.has(row?.target)) failures.push(`${prefix}.target is duplicated`);
        seen.add(row?.target);
        if (row?.currentTier !== "aggregate") failures.push(`${prefix}.currentTier must be aggregate`);
        if (row?.proposedTier !== "aggregate") failures.push(`${prefix}.proposedTier must be aggregate`);
        if (typeof row?.rationale !== "string") failures.push(`${prefix}.rationale must be a string`);
        for (const field of ["impactClass", "directPrerequisites", "transitiveTargets", "commands", "npmScripts", "tests", "artifacts", "checkerSources", "policyContracts", "literalTopologyConsumers", "duplicateOwners", "evidence"]) {
            if (!Array.isArray(row?.[field])) failures.push(`${prefix}.${field} must be an array`);
        }
        if (typeof row?.network !== "boolean" || typeof row?.live !== "boolean") failures.push(`${prefix}.network/live must be booleans`);
    }
    if (!Number.isInteger(inventory?.decisionPrerequisiteCount)) failures.push("decisionPrerequisiteCount must be an integer");
    if (!Array.isArray(inventory?.decisionPrerequisites)) failures.push("decisionPrerequisites must be an array");
    if (!Array.isArray(inventory?.decisionRows)) failures.push("decisionRows must be an array");
    if (Array.isArray(inventory?.decisionPrerequisites) && inventory.decisionPrerequisiteCount !== inventory.decisionPrerequisites.length) {
        failures.push("decisionPrerequisiteCount must equal decisionPrerequisites.length");
    }
    if (Array.isArray(inventory?.decisionRows) && inventory.decisionRows.length !== inventory.decisionPrerequisiteCount) {
        failures.push("decisionRows must cover every decision prerequisite");
    }
    const decisionExpected = new Set(inventory?.decisionPrerequisites ?? []);
    const decisionSeen = new Set();
    const validDecisionTiers = new Set(["pr_blocking", "release_blocking", "scheduled_governance", "retire_after_replacement"]);
    for (const [index, row] of (inventory?.decisionRows ?? []).entries()) {
        const prefix = `decisionRows[${index}]`;
        if (row?.target == null || !decisionExpected.has(row.target)) failures.push(`${prefix}.target is not a decision prerequisite`);
        if (decisionSeen.has(row?.target)) failures.push(`${prefix}.target is duplicated`);
        decisionSeen.add(row?.target);
        if (row?.currentTier !== "pr_blocking") failures.push(`${prefix}.currentTier must be pr_blocking`);
        if (!validDecisionTiers.has(row?.proposedTier)) failures.push(`${prefix}.proposedTier is invalid or unresolved`);
        if (typeof row?.rationale !== "string" || row.rationale.trim() === "") failures.push(`${prefix}.rationale must be non-empty`);
        for (const field of ["impactClass", "directPrerequisites", "transitiveTargets", "commands", "npmScripts", "tests", "artifacts", "checkerSources", "policyContracts", "literalTopologyConsumers", "duplicateOwners", "evidence"]) {
            if (!Array.isArray(row?.[field])) failures.push(`${prefix}.${field} must be an array`);
        }
        if (typeof row?.network !== "boolean" || typeof row?.live !== "boolean") failures.push(`${prefix}.network/live must be booleans`);
    }
    return failures;
}

function pathsForOutput(rootDir) {
    return {
        json: path.join(rootDir, "docs", "gate-tier-inventory.json"),
        markdown: path.join(rootDir, "docs", "gate-tier-inventory.md"),
    };
}

export function runCli({ rootDir = ROOT, argv = process.argv.slice(2) } = {}) {
    const args = new Set(argv);
    const inventory = buildInventory({ rootDir });
    const failures = validateInventory(inventory);
    if (failures.length > 0) throw new Error(failures.join("; "));
    const expectedJson = jsonFor(inventory);
    const expectedMarkdown = markdownFor(inventory);
    const outputs = pathsForOutput(rootDir);

    if (args.has("--write")) {
        fs.writeFileSync(outputs.json, expectedJson);
        fs.writeFileSync(outputs.markdown, expectedMarkdown);
        console.log(`wrote ${relativePath(rootDir, outputs.json)} and ${relativePath(rootDir, outputs.markdown)} (${inventory.directPrerequisiteCount} direct prerequisites)`);
        return inventory;
    }
    if (args.has("--check")) {
        const stale = [];
        if (!fs.existsSync(outputs.json) || fs.readFileSync(outputs.json, "utf8") !== expectedJson) stale.push(relativePath(rootDir, outputs.json));
        if (!fs.existsSync(outputs.markdown) || fs.readFileSync(outputs.markdown, "utf8") !== expectedMarkdown) stale.push(relativePath(rootDir, outputs.markdown));
        if (stale.length > 0) throw new Error(`gate-tier inventory drift: ${stale.join(", ")}. Run make gate-tier-inventory.`);
        console.log(`gate-tier inventory is current (${inventory.directPrerequisiteCount} aggregate prerequisites; ${inventory.decisionPrerequisiteCount} decision rows)`);
        return inventory;
    }
    process.stdout.write(expectedJson);
    return inventory;
}

const invokedAsScript = process.argv[1] != null && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(THIS_FILE).href;
if (invokedAsScript) {
    try {
        runCli();
    } catch (error) {
        console.error(`gate-tier inventory failed: ${error.message}`);
        process.exitCode = 1;
    }
}
