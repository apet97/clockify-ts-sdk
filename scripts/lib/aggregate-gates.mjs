import path from "node:path";

const SIMPLE_TARGET = /^[A-Za-z0-9_.+@/-]+$/;
const MAKE_NO_VALUE_OPTIONS = new Set([
    "--always-make",
    "--keep-going",
    "--no-builtin-rules",
    "--no-builtin-variables",
    "--no-print-directory",
    "--silent",
    "-B",
    "-k",
    "-r",
    "-R",
    "-s",
]);
const MAKE_VALUE_OPTIONS = new Set(["--directory", "-C"]);

function stripComment(line) {
    let quote = null;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === "\\") {
            index += 1;
            continue;
        }
        if (quote != null) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === "#") return line.slice(0, index);
    }
    return line;
}

export function parseMakefile(makefileText) {
    const targets = new Map();
    const definitions = new Map();
    const phony = new Set();
    const parseFailures = [];
    const lines = makefileText.split("\n");
    let activeTargets = [];

    for (let index = 0; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        const raw = lines[index];
        if (raw.startsWith("\t")) {
            if (activeTargets.length > 0) {
                let recipe = raw.slice(1);
                while (recipe.endsWith("\\") && lines[index + 1]?.startsWith("\t")) {
                    recipe = `${recipe.slice(0, -1)} ${lines[++index].slice(1).trimStart()}`;
                }
                for (const target of activeTargets) {
                    targets.get(target)?.recipes.push(recipe);
                }
            }
            continue;
        }

        if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
        activeTargets = [];
        if (raw.endsWith("\\")) {
            parseFailures.push(`Makefile line ${lineNumber}: target continuations are unsupported`);
            continue;
        }

        const text = stripComment(raw);
        const match = text.match(/^([^:=]+):\s*(.*)$/);
        if (match == null) continue;
        const names = match[1].trim().split(/\s+/).filter(Boolean);
        const prerequisites = match[2].trim().split(/\s+/).filter(Boolean);
        if (names.length === 0) continue;
        if (names[0] === ".PHONY") {
            for (const prerequisite of prerequisites) phony.add(prerequisite);
            continue;
        }

        for (const name of names) {
            const prior = definitions.get(name) ?? [];
            prior.push(lineNumber);
            definitions.set(name, prior);
            if (!targets.has(name)) {
                targets.set(name, {
                    name,
                    line: lineNumber,
                    prerequisites: [...prerequisites],
                    recipes: [],
                });
            }
        }
        activeTargets = names;
    }

    return { targets, definitions, phony, parseFailures };
}

function shellTokens(commandLine) {
    const tokens = [];
    let token = "";
    let quote = null;
    const push = () => {
        if (token !== "") tokens.push(token);
        token = "";
    };

    for (let index = 0; index < commandLine.length; index += 1) {
        const char = commandLine[index];
        if (quote != null) {
            if (char === quote) {
                quote = null;
            } else if (char === "\\" && quote === '"' && index + 1 < commandLine.length) {
                token += commandLine[++index];
            } else {
                token += char;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === "\\" && index + 1 < commandLine.length) {
            token += commandLine[++index];
            continue;
        }
        if (/\s/.test(char)) {
            push();
            continue;
        }
        const pair = commandLine.slice(index, index + 2);
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
        token += char;
    }
    push();
    return { tokens, unterminatedQuote: quote };
}

function commandSegments(commandLine) {
    const { tokens, unterminatedQuote } = shellTokens(commandLine);
    const segments = [];
    let current = [];
    for (const token of tokens) {
        if (["&&", "||", ";", "|"].includes(token)) {
            segments.push({ tokens: current, connector: token });
            current = [];
        } else {
            current.push(token);
        }
    }
    segments.push({ tokens: current, connector: null });
    return { segments, unterminatedQuote };
}

function stripRecipePrefix(line) {
    return line.replace(/^[@+\-]+/, "").trim();
}

function skipEnvironment(tokens) {
    let index = 0;
    if (tokens[index] === "env") index += 1;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[index])) {
        index += 1;
    }
    return index;
}

function unwrapCommand(tokens) {
    let index = skipEnvironment(tokens);
    while (tokens[index] === "command") {
        index += 1;
        if (tokens[index] === "--") index += 1;
    }
    return { command: tokens[index] ?? null, args: tokens.slice(index + 1) };
}

function normalizeDirectory(directory) {
    const normalized = path.normalize(directory || ".").replace(/\\/g, "/");
    return normalized === "" ? "." : normalized;
}

function parseMakeArguments(args, initialDirectory) {
    let directory = normalizeDirectory(initialDirectory);
    const targets = [];
    const failures = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (MAKE_NO_VALUE_OPTIONS.has(arg)) continue;
        if (MAKE_VALUE_OPTIONS.has(arg)) {
            const value = args[++index];
            if (value == null || value === "" || path.isAbsolute(value) || /[$*?{}]/.test(value)) {
                failures.push(`make option ${arg} requires a value`);
            } else {
                directory = normalizeDirectory(path.join(directory, value));
            }
            continue;
        }
        if (arg.startsWith("--directory=")) {
            const value = arg.slice("--directory=".length);
            if (value === "" || path.isAbsolute(value) || /[$*?{}]/.test(value)) {
                failures.push(`make option --directory requires a literal relative value`);
            } else {
                directory = normalizeDirectory(path.join(directory, value));
            }
            continue;
        }
        if (arg.startsWith("-C") && arg.length > 2) {
            const value = arg.slice(2);
            if (path.isAbsolute(value) || /[$*?{}]/.test(value)) {
                failures.push(`make option -C requires a literal relative value`);
            } else {
                directory = normalizeDirectory(path.join(directory, value));
            }
            continue;
        }
        if (arg.startsWith("-")) {
            failures.push(`unsupported make option ${arg}`);
            continue;
        }
        if (/^\d*(?:>|>>|<)/.test(arg)) continue;
        if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(arg)) continue;
        if (!SIMPLE_TARGET.test(arg) || arg.includes("%")) {
            failures.push(`unsupported make target indirection ${arg}`);
            continue;
        }
        targets.push(arg);
    }
    if (targets.length === 0) failures.push("recursive make invocation has no explicit target set");
    return { directory, targets, failures };
}

function npmRunScript(args) {
    const runIndex = args.findIndex((arg) => arg === "run" || arg === "run-script");
    if (runIndex < 0) return null;
    for (let index = runIndex + 1; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--") continue;
        if (arg === "-w" || arg === "--workspace") {
            index += 1;
            continue;
        }
        if (arg.startsWith("--workspace=")) continue;
        if (arg.startsWith("-")) continue;
        return arg;
    }
    return null;
}

function npmWorkspace(args) {
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "-w" || arg === "--workspace") return args[index + 1] ?? null;
        if (arg.startsWith("--workspace=")) return arg.slice("--workspace=".length);
    }
    return null;
}

function npmScriptInvocation(command, args) {
    if (command !== "npm") return null;
    if (args[0] === "test") return { script: "test", workspace: npmWorkspace(args) };
    const script = npmRunScript(args);
    return script == null ? null : { script, workspace: npmWorkspace(args) };
}

function localMutationReason(command, args) {
    const isStryker = (value) => typeof value === "string" && /(^|[/@-])stryker(?:$|[/@-])/i.test(value);
    if (isStryker(command)) return "direct Stryker execution";
    if (command === "npx" && args.some(isStryker)) {
        return "Stryker execution through npx";
    }
    if (command === "npm") {
        const script = npmRunScript(args);
        if (script === "mutation") return "npm mutation package script";
        const execIndex = args.findIndex((arg) => arg === "exec" || arg === "x");
        if (execIndex >= 0 && args.slice(execIndex + 1).some(isStryker)) {
            return `Stryker execution through npm ${args[execIndex]}`;
        }
    }
    return null;
}

function validateBounds(bounds, failures) {
    for (const key of [
        "maxDepth",
        "maxInvocations",
        "maxTargetVisits",
        "maxRecipeLines",
        "maxCommandSegments",
        "maxPackageScripts",
    ]) {
        if (!Number.isInteger(bounds?.[key]) || bounds[key] < 1) {
            failures.push(`${key}: bound must be a positive integer`);
        }
    }
}

export function evaluateAggregateGates({
    makefileText,
    contract,
    commandsForPhase,
    packageCatalog = null,
    makefileProvider = null,
}) {
    const failures = [];
    const bounds = contract?.bounds ?? {};
    validateBounds(bounds, failures);
    const configuredDirectories = contract?.makefiles?.allowedDirectories ?? ["."];
    const allowedDirectories = new Set();
    if (!Array.isArray(configuredDirectories) || configuredDirectories.length === 0) {
        failures.push("makefiles.allowedDirectories: must be a non-empty array");
    } else {
        for (const [index, directory] of configuredDirectories.entries()) {
            if (typeof directory !== "string" || directory.trim() === "" || path.isAbsolute(directory)) {
                failures.push(`makefiles.allowedDirectories[${index}]: must be a repo-relative directory`);
                continue;
            }
            allowedDirectories.add(normalizeDirectory(directory));
        }
    }
    if (!allowedDirectories.has(".")) {
        failures.push('makefiles.allowedDirectories: must include "."');
    }

    const modelCache = new Map();
    function modelFor(directory, commandPath) {
        const normalized = normalizeDirectory(directory);
        if (!allowedDirectories.has(normalized)) {
            failures.push(`${commandPath}: Make directory ${normalized} is outside allowed policy`);
            return null;
        }
        if (modelCache.has(normalized)) return modelCache.get(normalized);
        let source;
        try {
            source = normalized === "." ? makefileText : makefileProvider?.(normalized);
        } catch (error) {
            failures.push(`${commandPath}: ${normalized}/Makefile provider failed: ${error.message}`);
            modelCache.set(normalized, null);
            return null;
        }
        if (typeof source !== "string") {
            failures.push(`${commandPath}: ${normalized}/Makefile is unavailable`);
            modelCache.set(normalized, null);
            return null;
        }
        const model = parseMakefile(source);
        for (const failure of model.parseFailures) {
            failures.push(`${normalized}/Makefile: ${failure}`);
        }
        modelCache.set(normalized, model);
        return model;
    }

    const rootModel = modelFor(".", "root aggregate graph");
    const aggregateResults = {};

    function analyzeExecution(label, executionSpec, { rootTarget = null, commands = null } = {}) {
        const sequence = [];
        const occurrencePaths = new Map();
        const verifyPhases = [];
        const executedByInvocation = new Map();
        let invocationCount = 0;
        let targetVisits = 0;
        let recipeLines = 0;
        let commandSegmentCount = 0;
        let packageScriptCount = 0;
        let stopped = false;

        function bounded(counter, maximum, label) {
            if (counter <= maximum) return false;
            failures.push(`${executionSpec?.name ?? rootTarget ?? "execution"}: ${label} exceeded ${maximum} bound`);
            stopped = true;
            return true;
        }

        const executionName = executionSpec?.name ?? rootTarget ?? label;

        function identityFor(directory, target) {
            return directory === "." ? target : `${directory}::${target}`;
        }

        function record(target, targetPath, invocationId) {
            const paths = occurrencePaths.get(target) ?? [];
            paths.push({ path: targetPath, invocationId });
            occurrencePaths.set(target, paths);
            const executed = executedByInvocation.get(invocationId) ?? new Set();
            const alreadyReached = executed.has(target);
            executed.add(target);
            executedByInvocation.set(invocationId, executed);
            return alreadyReached;
        }

        function visitTarget(
            target,
            targetPath,
            stack,
            directory = ".",
            invocationId,
            invocationAncestry = [],
        ) {
            if (stopped) return;
            targetVisits += 1;
            if (bounded(targetVisits, bounds.maxTargetVisits, "maxTargetVisits")) return;
            if (bounded(stack.length + 1, bounds.maxDepth, "maxDepth")) return;

            const normalizedDirectory = normalizeDirectory(directory);
            const namespaced = identityFor(normalizedDirectory, target);
            if (stack.includes(namespaced)) {
                record(namespaced, targetPath, invocationId);
                failures.push(`${executionName}: dependency cycle ${[...stack, namespaced].join(" -> ")}`);
                return;
            }
            const alreadyReached = record(namespaced, targetPath, invocationId);
            if (target === "mutation") {
                failures.push(`${targetPath}: reaches ${namespaced} local mutation target`);
            }
            // GNU Make coalesces repeated prerequisite paths within one
            // invocation. Retain every route for claim diagnostics, but do
            // not invent a second execution for shared setup prerequisites.
            if (alreadyReached) return;
            const model = modelFor(normalizedDirectory, targetPath);
            if (model == null) return;
            const definitionLines = model.definitions.get(target) ?? [];
            if (definitionLines.length > 1) {
                failures.push(
                    `${executionName}: ${namespaced} is defined more than once at ${definitionLines
                        .map((line) => `line ${line}`)
                        .join(
                        " and ",
                    )}; reached by ${targetPath}`,
                );
                return;
            }
            const definition = model.targets.get(target);
            if (definition == null) {
                failures.push(`${executionName}: ${namespaced} is an unknown target at ${targetPath}`);
                return;
            }
            if (!model.phony.has(target)) {
                failures.push(`${executionName}: governed target ${namespaced} is not declared in .PHONY`);
            }

            for (const prerequisite of definition.prerequisites) {
                if (!SIMPLE_TARGET.test(prerequisite) || prerequisite.includes("%")) {
                    failures.push(
                        `${executionName}: unsupported prerequisite indirection ${prerequisite} at ${targetPath}`,
                    );
                    continue;
                }
                visitTarget(
                    prerequisite,
                    `${targetPath} -> ${prerequisite}`,
                    [...stack, namespaced],
                    normalizedDirectory,
                    invocationId,
                    invocationAncestry,
                );
            }

            if (target !== rootTarget) sequence.push(namespaced);
            for (const recipe of definition.recipes) {
                recipeLines += 1;
                if (bounded(recipeLines, bounds.maxRecipeLines, "maxRecipeLines")) return;
                walkCommandLine(
                    stripRecipePrefix(recipe),
                    normalizedDirectory,
                    `${executionName}: ${targetPath}`,
                    [...invocationAncestry, namespaced],
                    [],
                    stack.length + 1,
                );
            }
        }

        function visitInvocation(targets, invocationPath, directory = ".", invocationAncestry = []) {
            if (stopped) return;
            invocationCount += 1;
            if (bounded(invocationCount, bounds.maxInvocations, "maxInvocations")) return;
            const normalizedDirectory = normalizeDirectory(directory);
            const invocationId = invocationCount;
            const duplicateRequested = targets.filter(
                (target, index) => targets.indexOf(target) !== index,
            );
            for (const target of new Set(duplicateRequested)) {
                const identity = identityFor(normalizedDirectory, target);
                failures.push(
                    `${executionName}: ${identity} requested more than once in ${invocationPath}; paths ${invocationPath} -> ${identity} AND ${invocationPath} -> ${identity}`,
                );
            }
            for (const target of targets) {
                const identity = identityFor(normalizedDirectory, target);
                if (invocationAncestry.includes(identity)) {
                    failures.push(
                        `${executionName}: recursive make cycle ${[...invocationAncestry, identity].join(" -> ")}`,
                    );
                    continue;
                }
                visitTarget(
                    target,
                    `${invocationPath} -> ${identity}`,
                    [],
                    normalizedDirectory,
                    invocationId,
                    invocationAncestry,
                );
            }
        }

        function visitPackageScript(
            command,
            args,
            directory,
            commandPath,
            invocationAncestry,
            scriptStack,
            depth,
        ) {
            const invocation = npmScriptInvocation(command, args);
            if (invocation == null) return;
            packageScriptCount += 1;
            if (bounded(packageScriptCount, bounds.maxPackageScripts, "maxPackageScripts")) return;
            if (bounded(depth + 1, bounds.maxDepth, "maxDepth")) return;
            if (packageCatalog == null) {
                failures.push(`${commandPath}: package catalog is unavailable for npm script traversal`);
                return;
            }
            const packageDirectory = invocation.workspace == null
                ? normalizeDirectory(directory)
                : normalizeDirectory(packageCatalog.byName?.[invocation.workspace] ?? "");
            if (invocation.workspace != null && packageCatalog.byName?.[invocation.workspace] == null) {
                failures.push(
                    `${commandPath}: invoked npm workspace ${JSON.stringify(invocation.workspace)} is unknown`,
                );
                return;
            }
            const manifest = packageCatalog.byDirectory?.[packageDirectory];
            if (manifest == null) {
                failures.push(`${commandPath}: package manifest for ${packageDirectory} is unavailable`);
                return;
            }
            const identity = `${packageDirectory}:${invocation.script}`;
            if (scriptStack.includes(identity)) {
                failures.push(`${commandPath}: package script cycle ${[...scriptStack, identity].join(" -> ")}`);
                return;
            }
            const body = manifest.scripts?.[invocation.script];
            if (typeof body !== "string") {
                failures.push(`${commandPath}: package script ${identity} is missing`);
                return;
            }
            walkCommandLine(
                body,
                packageDirectory,
                `${commandPath} -> ${identity}`,
                invocationAncestry,
                [...scriptStack, identity],
                depth + 1,
            );
        }

        function walkCommandTokens(
            tokens,
            directory,
            commandPath,
            invocationAncestry,
            scriptStack,
            depth,
        ) {
            if (stopped) return;
            if (bounded(depth + 1, bounds.maxDepth, "maxDepth")) return;
            const { command, args } = unwrapCommand(tokens);
            if (command == null) return;
            if (["bash", "sh", "zsh", "dash"].includes(command) && args.includes("-c")) {
                failures.push(
                    `${commandPath}: unsupported shell command indirection ${command} ${args.join(" ")}`,
                );
                return;
            }
            const reason = localMutationReason(command, args);
            if (reason != null) {
                failures.push(`${commandPath}: local mutation (${reason})`);
            }
            if (command === "make" || command === "$(MAKE)") {
                const parsed = parseMakeArguments(args, directory);
                for (const parseFailure of parsed.failures) {
                    failures.push(`${commandPath}: recursive make ${parseFailure}`);
                }
                if (parsed.targets.length > 0) {
                    visitInvocation(
                        parsed.targets,
                        `${commandPath} -> recursive make`,
                        parsed.directory,
                        invocationAncestry,
                    );
                }
                return;
            }
            if (command === "node" && args[0] === "scripts/verify.mjs" && args[1] != null) {
                const phase = args[1];
                verifyPhases.push(phase);
                let phaseCommands;
                try {
                    phaseCommands = commandsForPhase(phase);
                } catch (error) {
                    failures.push(`${commandPath}: verify ${phase} plan unavailable: ${error.message}`);
                    return;
                }
                for (const [index, entry] of phaseCommands.entries()) {
                    walkCommandTokens(
                        [entry.command, ...(entry.args ?? [])],
                        ".",
                        `${commandPath} -> verify ${phase}[${index}]`,
                        invocationAncestry,
                        scriptStack,
                        depth + 1,
                    );
                }
                return;
            }
            visitPackageScript(
                command,
                args,
                directory,
                commandPath,
                invocationAncestry,
                scriptStack,
                depth,
            );
            const makeLike = args.some(
                (arg) =>
                    arg === "make" ||
                    arg === "$(MAKE)" ||
                    arg === "$MAKE" ||
                    arg === "${MAKE}",
            );
            if (makeLike) {
                failures.push(`${commandPath}: unsupported Make-like command indirection: ${tokens.join(" ")}`);
            }
        }

        function walkCommandLine(
            commandLine,
            initialDirectory,
            commandPath,
            invocationAncestry,
            scriptStack,
            depth,
        ) {
            const { segments, unterminatedQuote } = commandSegments(commandLine);
            if (unterminatedQuote != null) {
                failures.push(`${commandPath}: command has unterminated quote: ${commandLine}`);
            }
            let directory = normalizeDirectory(initialDirectory);
            for (const [index, segment] of segments.entries()) {
                if (segment.tokens.length === 0) continue;
                commandSegmentCount += 1;
                if (bounded(commandSegmentCount, bounds.maxCommandSegments, "maxCommandSegments")) return;
                const descriptor = unwrapCommand(segment.tokens);
                if (descriptor.command === "cd") {
                    const next = descriptor.args[0];
                    if (
                        next == null ||
                        next === "" ||
                        path.isAbsolute(next) ||
                        /[$*?{}]/.test(next) ||
                        !["&&", ";"].includes(segment.connector)
                    ) {
                        failures.push(`${commandPath}: unsupported cd indirection: ${commandLine}`);
                    } else {
                        directory = normalizeDirectory(path.join(directory, next));
                    }
                    continue;
                }
                walkCommandTokens(
                    segment.tokens,
                    directory,
                    `${commandPath} command[${index}]`,
                    invocationAncestry,
                    scriptStack,
                    depth + 1,
                );
            }
        }

        if (rootTarget != null) {
            visitInvocation([rootTarget], label);
        } else {
            for (const [index, entry] of (commands ?? []).entries()) {
                walkCommandTokens(
                    [entry.command, ...(entry.args ?? [])],
                    ".",
                    `${label}[${index}]`,
                    [],
                    [],
                    0,
                );
            }
        }

        for (const [target, paths] of occurrencePaths.entries()) {
            const invocationIds = new Set(paths.map((entry) => entry.invocationId));
            if (invocationIds.size > 1 || paths.length > 1) {
                failures.push(
                    `${executionName}: ${target} executes more than once via ${paths
                        .map((entry) => entry.path)
                        .join(" AND ")}`,
                );
            }
        }

        const expectedPhase = executionSpec.verifyPhase;
        if (typeof expectedPhase === "string") {
            if (verifyPhases.length !== 1 || verifyPhases[0] !== expectedPhase) {
                failures.push(
                    `${executionName}: expected exactly one verify ${expectedPhase} invocation, got ${JSON.stringify(
                        verifyPhases,
                    )}`,
                );
            }
        } else if (verifyPhases.length > 0) {
            failures.push(`${executionName}: unexpected verify invocation(s): ${verifyPhases.join(", ")}`);
        }

        for (const required of executionSpec.requiredTargets ?? []) {
            if (!occurrencePaths.has(required)) {
                failures.push(`${executionName}: missing required target ${required}`);
            }
        }

        if (executionSpec.performanceLast === true) {
            const performance = contract.performanceTarget;
            const paths = occurrencePaths.get(performance) ?? [];
            const executionCount = new Set(paths.map((entry) => entry.invocationId)).size;
            if (executionCount !== 1) {
                failures.push(`${executionName}: ${performance} must execute exactly once`);
            }
            if (sequence.at(-1) !== performance) {
                failures.push(`${executionName}: ${performance} must be last; sequence ends with ${sequence.at(-1)}`);
            }
        }

        if (
            Array.isArray(executionSpec.expectedSequence) &&
            JSON.stringify(sequence) !== JSON.stringify(executionSpec.expectedSequence)
        ) {
            failures.push(
                `${executionName}: execution sequence drift; expected ${JSON.stringify(
                    executionSpec.expectedSequence,
                )} but got ${JSON.stringify(sequence)}`,
            );
        }

        if (executionSpec.requireUnitExecutionCounts === true) {
            for (const [target, paths] of occurrencePaths.entries()) {
                if (target === rootTarget) continue;
                const executionCount = new Set(paths.map((entry) => entry.invocationId)).size;
                if (executionCount !== 1) {
                    failures.push(
                        `${executionName}: ${target} execution count must be 1; got ${executionCount}`,
                    );
                }
            }
        }

        return {
            sequence,
            counts: Object.fromEntries(
                [...occurrencePaths.entries()]
                    .filter(([target]) => target !== rootTarget)
                    .map(([target, paths]) => [
                        target,
                        new Set(paths.map((entry) => entry.invocationId)).size,
                    ]),
            ),
            paths: Object.fromEntries(
                [...occurrencePaths.entries()].map(([target, paths]) => [
                    target,
                    paths.map((entry) => entry.path),
                ]),
            ),
        };
    }

    function validateStandaloneTargetOrder() {
        if (rootModel == null) return;
        for (const [target, spec] of Object.entries(contract?.standaloneTargetOrder ?? {})) {
            const definition = rootModel.targets.get(target);
            if (definition == null) {
                failures.push(`standalone target ${target}: definition is missing`);
                continue;
            }
            if (!rootModel.phony.has(target)) {
                failures.push(`standalone target ${target}: is not declared in .PHONY`);
            }
            for (const setup of spec.setupPrerequisites ?? []) {
                if (!definition.prerequisites.includes(setup)) {
                    failures.push(`standalone target ${target}: missing setup prerequisite ${setup}`);
                }
            }
            if (definition.prerequisites.includes(spec.runTarget)) {
                failures.push(
                    `standalone target ${target}: ${spec.runTarget} must run in the recipe after setup prerequisites, not as a sibling prerequisite`,
                );
            }
            let runCalls = 0;
            for (const recipe of definition.recipes) {
                const { segments } = commandSegments(stripRecipePrefix(recipe));
                let directory = ".";
                for (const segment of segments) {
                    const descriptor = unwrapCommand(segment.tokens);
                    if (descriptor.command === "cd" && ["&&", ";"].includes(segment.connector)) {
                        directory = normalizeDirectory(path.join(directory, descriptor.args[0] ?? ""));
                        continue;
                    }
                    if (descriptor.command !== "make" && descriptor.command !== "$(MAKE)") continue;
                    const parsed = parseMakeArguments(descriptor.args, directory);
                    if (
                        parsed.failures.length === 0 &&
                        parsed.directory === "." &&
                        parsed.targets.length === 1 &&
                        parsed.targets[0] === spec.runTarget
                    ) {
                        runCalls += 1;
                    }
                }
            }
            if (runCalls !== 1) {
                failures.push(
                    `standalone target ${target}: ${spec.runTarget} must execute exactly once in a recursive Make recipe after setup; got ${runCalls}`,
                );
            }
        }
    }

    for (const [aggregate, aggregateSpec] of Object.entries(contract?.aggregates ?? {})) {
        aggregateResults[aggregate] = analyzeExecution(aggregate, aggregateSpec, { rootTarget: aggregate });
    }

    for (const [aggregate, aggregateSpec] of Object.entries(contract?.aggregates ?? {})) {
        if (typeof aggregateSpec.includesAggregate !== "string") continue;
        const included = aggregateResults[aggregateSpec.includesAggregate];
        const current = aggregateResults[aggregate];
        if (included == null || current == null) continue;
        for (const claim of Object.keys(included.counts)) {
            if (!(claim in current.counts)) {
                failures.push(`${aggregate}: missing perfect-fast claim ${claim}`);
            }
        }
    }

    for (const [phase, spec] of Object.entries(contract?.standaloneVerify ?? {})) {
        let commands;
        try {
            commands = commandsForPhase(phase);
        } catch (error) {
            failures.push(`standalone verify ${phase}: plan unavailable: ${error.message}`);
            continue;
        }
        const proof = analyzeExecution(
            `standalone verify ${phase}`,
            { name: `standalone verify ${phase}` },
            { commands },
        );
        for (const target of spec.exactlyOnce ?? []) {
            const count = proof.counts[target] ?? 0;
            if (count !== 1) {
                failures.push(`standalone verify ${phase}: ${target} must execute exactly once; got ${count}`);
            }
        }
    }

    validateStandaloneTargetOrder();

    return { failures, aggregates: aggregateResults };
}
