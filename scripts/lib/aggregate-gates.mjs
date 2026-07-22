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
                for (const target of activeTargets) {
                    targets.get(target)?.recipes.push(raw.slice(1));
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

function parseMakeArguments(args, initialDirectory) {
    let directory = initialDirectory;
    const targets = [];
    const failures = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (MAKE_NO_VALUE_OPTIONS.has(arg)) continue;
        if (MAKE_VALUE_OPTIONS.has(arg)) {
            const value = args[++index];
            if (value == null || value === "") {
                failures.push(`make option ${arg} requires a value`);
            } else {
                directory = path.normalize(path.join(directory, value));
            }
            continue;
        }
        if (arg.startsWith("--directory=")) {
            directory = path.normalize(path.join(directory, arg.slice("--directory=".length)));
            continue;
        }
        if (arg.startsWith("-C") && arg.length > 2) {
            directory = path.normalize(path.join(directory, arg.slice(2)));
            continue;
        }
        if (arg.startsWith("-")) {
            failures.push(`unsupported make option ${arg}`);
            continue;
        }
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

function makeInvocationsFromRecipe(line) {
    const clean = stripRecipePrefix(line);
    const failures = [];
    if (/\$\(MAKE\)|(^|[;&|\s])make(?:\s|$)/.test(clean) && clean.endsWith("\\")) {
        failures.push(`recursive make uses unsupported continuation: ${clean}`);
        return { failures, invocations: [] };
    }
    const { segments, unterminatedQuote } = commandSegments(clean);
    if (unterminatedQuote != null) failures.push(`recipe has unterminated quote: ${clean}`);
    let directory = ".";
    const invocations = [];
    for (const segment of segments) {
        const start = skipEnvironment(segment.tokens);
        const executable = segment.tokens[start];
        if (executable === "cd") {
            const next = segment.tokens[start + 1];
            if (next == null || next === "" || /[$*?{}]/.test(next)) {
                failures.push(`recursive make uses unsupported cd indirection: ${clean}`);
            } else if (segment.connector === "&&" || segment.connector === ";") {
                directory = path.normalize(path.join(directory, next));
            }
            continue;
        }
        if (executable !== "make" && executable !== "$(MAKE)") continue;
        const parsed = parseMakeArguments(segment.tokens.slice(start + 1), directory);
        failures.push(...parsed.failures.map((failure) => `recursive make ${failure}: ${clean}`));
        invocations.push({ directory: parsed.directory, targets: parsed.targets, source: clean });
    }
    return { failures, invocations };
}

function npmRunScript(args) {
    const runIndex = args.indexOf("run");
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
    if (command === "stryker") return "direct Stryker execution";
    if (command === "npx" && args.some((arg) => arg === "stryker")) {
        return "Stryker execution through npx";
    }
    if (command === "npm") {
        const script = npmRunScript(args);
        if (script === "mutation") return "npm mutation package script";
        const execIndex = args.indexOf("exec");
        if (execIndex >= 0 && args.slice(execIndex + 1).some((arg) => arg === "stryker")) {
            return "Stryker execution through npm exec";
        }
    }
    return null;
}

function mutationReasonsFromRecipe(line) {
    const clean = stripRecipePrefix(line);
    const { segments } = commandSegments(clean);
    const reasons = [];
    for (const segment of segments) {
        const start = skipEnvironment(segment.tokens);
        const executable = segment.tokens[start];
        if (executable == null) continue;
        const reason = localMutationReason(executable, segment.tokens.slice(start + 1));
        if (reason != null) reasons.push(reason);
    }
    return reasons;
}

function verifyInvocationFromRecipe(line) {
    const clean = stripRecipePrefix(line);
    const { segments } = commandSegments(clean);
    const phases = [];
    for (const segment of segments) {
        const start = skipEnvironment(segment.tokens);
        const tokens = segment.tokens.slice(start);
        if (tokens[0] === "node" && tokens[1] === "scripts/verify.mjs" && tokens[2] != null) {
            phases.push(tokens[2]);
        }
    }
    return phases;
}

function validateBounds(bounds, failures) {
    for (const key of ["maxDepth", "maxInvocations", "maxTargetVisits", "maxRecipeLines"]) {
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
}) {
    const model = parseMakefile(makefileText);
    const failures = [...model.parseFailures];
    const bounds = contract?.bounds ?? {};
    validateBounds(bounds, failures);
    const aggregateResults = {};

    function scanPackageScript(command, args, directory, commandPath, stack = []) {
        const invocation = npmScriptInvocation(command, args);
        if (invocation == null || packageCatalog == null) return;
        const packageDirectory = invocation.workspace == null
            ? path.normalize(directory)
            : packageCatalog.byName?.[invocation.workspace];
        if (packageDirectory == null) {
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
        if (stack.includes(identity)) {
            failures.push(`${commandPath}: package script cycle ${[...stack, identity].join(" -> ")}`);
            return;
        }
        if (stack.length >= (contract?.bounds?.maxDepth ?? 0)) {
            failures.push(`${commandPath}: package script maxDepth bound exceeded`);
            return;
        }
        const body = manifest.scripts?.[invocation.script];
        if (typeof body !== "string") {
            failures.push(`${commandPath}: package script ${identity} is missing`);
            return;
        }
        for (const reason of mutationReasonsFromRecipe(body)) {
            failures.push(
                `${commandPath} -> ${[...stack, identity].join(" -> ")}: local mutation (${reason}) in package script`,
            );
        }
        scanCommandLinePackageScripts(
            body,
            packageDirectory,
            commandPath,
            [...stack, identity],
        );
    }

    function scanCommandLinePackageScripts(commandLine, initialDirectory, commandPath, stack = []) {
        const { segments } = commandSegments(commandLine);
        let directory = initialDirectory;
        for (const segment of segments) {
            const start = skipEnvironment(segment.tokens);
            const executable = segment.tokens[start];
            if (executable === "cd") {
                const next = segment.tokens[start + 1];
                if (
                    next != null &&
                    next !== "" &&
                    !/[$*?{}]/.test(next) &&
                    (segment.connector === "&&" || segment.connector === ";")
                ) {
                    directory = path.normalize(path.join(directory, next));
                }
                continue;
            }
            if (executable == null) continue;
            scanPackageScript(
                executable,
                segment.tokens.slice(start + 1),
                directory,
                commandPath,
                stack,
            );
        }
    }

    function analyzeAggregate(aggregate, aggregateSpec) {
        const sequence = [];
        const occurrencePaths = new Map();
        const verifyPhases = [];
        const executedByInvocation = new Map();
        let invocationCount = 0;
        let targetVisits = 0;
        let recipeLines = 0;
        let stopped = false;

        function bounded(counter, maximum, label) {
            if (counter <= maximum) return false;
            failures.push(`${aggregate}: ${label} exceeded ${maximum} bound`);
            stopped = true;
            return true;
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

        function visitTarget(target, targetPath, stack, directory = ".", invocationId) {
            if (stopped) return;
            targetVisits += 1;
            if (bounded(targetVisits, bounds.maxTargetVisits, "maxTargetVisits")) return;
            if (bounded(stack.length + 1, bounds.maxDepth, "maxDepth")) return;

            const namespaced = directory === "." ? target : `${directory}::${target}`;
            if (directory === "." && stack.includes(target)) {
                record(namespaced, targetPath, invocationId);
                failures.push(`${aggregate}: dependency cycle ${[...stack, target].join(" -> ")}`);
                return;
            }
            const alreadyReached = record(namespaced, targetPath, invocationId);
            if (target === "mutation") {
                failures.push(`${targetPath}: reaches local mutation target`);
            }
            // GNU Make coalesces repeated prerequisite paths within one
            // invocation. Retain every route for claim diagnostics, but do
            // not invent a second execution for shared setup prerequisites.
            if (alreadyReached) return;
            if (directory !== ".") {
                sequence.push(namespaced);
                return;
            }
            const definitionLines = model.definitions.get(target) ?? [];
            if (definitionLines.length > 1) {
                failures.push(
                    `${aggregate}: ${target} is defined more than once at ${definitionLines
                        .map((line) => `line ${line}`)
                        .join(
                        " and ",
                    )}; reached by ${targetPath}`,
                );
                return;
            }
            const definition = model.targets.get(target);
            if (definition == null) {
                failures.push(`${aggregate}: ${target} is an unknown target at ${targetPath}`);
                return;
            }

            for (const prerequisite of definition.prerequisites) {
                if (!SIMPLE_TARGET.test(prerequisite) || prerequisite.includes("%")) {
                    failures.push(
                        `${aggregate}: unsupported prerequisite indirection ${prerequisite} at ${targetPath}`,
                    );
                    continue;
                }
                visitTarget(
                    prerequisite,
                    `${targetPath} -> ${prerequisite}`,
                    [...stack, target],
                    directory,
                    invocationId,
                );
            }

            if (target !== aggregate) sequence.push(target);
            for (const recipe of definition.recipes) {
                recipeLines += 1;
                if (bounded(recipeLines, bounds.maxRecipeLines, "maxRecipeLines")) return;
                for (const reason of mutationReasonsFromRecipe(recipe)) {
                    failures.push(`${aggregate}: ${targetPath}: local mutation (${reason}) in recipe: ${recipe.trim()}`);
                }
                scanCommandLinePackageScripts(
                    stripRecipePrefix(recipe),
                    ".",
                    `${aggregate}: ${targetPath}`,
                );

                for (const phase of verifyInvocationFromRecipe(recipe)) {
                    verifyPhases.push(phase);
                    let commands;
                    try {
                        commands = commandsForPhase(phase);
                    } catch (error) {
                        failures.push(`${aggregate}: verify ${phase} plan unavailable: ${error.message}`);
                        continue;
                    }
                    for (const [commandIndex, entry] of commands.entries()) {
                        const commandPath = `${targetPath} -> verify ${phase}[${commandIndex}]`;
                        const reason = localMutationReason(entry.command, entry.args ?? []);
                        if (reason != null) {
                            failures.push(`${aggregate}: ${commandPath}: local mutation (${reason})`);
                        }
                        scanPackageScript(
                            entry.command,
                            entry.args ?? [],
                            ".",
                            `${aggregate}: ${commandPath}`,
                        );
                        if (entry.command === "make") {
                            const parsed = parseMakeArguments(entry.args ?? [], ".");
                            for (const parseFailure of parsed.failures) {
                                failures.push(`${aggregate}: ${commandPath}: ${parseFailure}`);
                            }
                            visitInvocation(parsed.targets, commandPath, parsed.directory);
                        }
                    }
                }

                const recursive = makeInvocationsFromRecipe(recipe);
                failures.push(...recursive.failures.map((failure) => `${aggregate}: ${targetPath}: ${failure}`));
                for (const invocation of recursive.invocations) {
                    visitInvocation(
                        invocation.targets,
                        `${targetPath} -> recursive make`,
                        invocation.directory,
                    );
                }
            }
        }

        function visitInvocation(targets, invocationPath, directory = ".") {
            if (stopped) return;
            invocationCount += 1;
            if (bounded(invocationCount, bounds.maxInvocations, "maxInvocations")) return;
            const invocationId = invocationCount;
            const duplicateRequested = targets.filter(
                (target, index) => targets.indexOf(target) !== index,
            );
            for (const target of new Set(duplicateRequested)) {
                failures.push(
                    `${aggregate}: ${target} requested more than once in ${invocationPath}; paths ${invocationPath} -> ${target} AND ${invocationPath} -> ${target}`,
                );
            }
            for (const target of targets) {
                visitTarget(target, `${invocationPath} -> ${target}`, [], directory, invocationId);
            }
        }

        visitInvocation([aggregate], aggregate);

        for (const [target, paths] of occurrencePaths.entries()) {
            const invocationIds = new Set(paths.map((entry) => entry.invocationId));
            if (invocationIds.size > 1 || paths.length > 1) {
                failures.push(
                    `${aggregate}: ${target} executes more than once via ${paths
                        .map((entry) => entry.path)
                        .join(" AND ")}`,
                );
            }
        }

        const expectedPhase = aggregateSpec.verifyPhase;
        if (typeof expectedPhase === "string") {
            if (verifyPhases.length !== 1 || verifyPhases[0] !== expectedPhase) {
                failures.push(
                    `${aggregate}: expected exactly one verify ${expectedPhase} invocation, got ${JSON.stringify(
                        verifyPhases,
                    )}`,
                );
            }
        } else if (verifyPhases.length > 0) {
            failures.push(`${aggregate}: unexpected verify invocation(s): ${verifyPhases.join(", ")}`);
        }

        for (const required of aggregateSpec.requiredTargets ?? []) {
            if (!occurrencePaths.has(required)) {
                failures.push(`${aggregate}: missing required target ${required}`);
            }
        }

        if (aggregateSpec.performanceLast === true) {
            const performance = contract.performanceTarget;
            const paths = occurrencePaths.get(performance) ?? [];
            const executionCount = new Set(paths.map((entry) => entry.invocationId)).size;
            if (executionCount !== 1) {
                failures.push(`${aggregate}: ${performance} must execute exactly once`);
            }
            if (sequence.at(-1) !== performance) {
                failures.push(`${aggregate}: ${performance} must be last; sequence ends with ${sequence.at(-1)}`);
            }
        }

        if (
            Array.isArray(aggregateSpec.expectedSequence) &&
            JSON.stringify(sequence) !== JSON.stringify(aggregateSpec.expectedSequence)
        ) {
            failures.push(
                `${aggregate}: execution sequence drift; expected ${JSON.stringify(
                    aggregateSpec.expectedSequence,
                )} but got ${JSON.stringify(sequence)}`,
            );
        }

        if (aggregateSpec.requireUnitExecutionCounts === true) {
            for (const [target, paths] of occurrencePaths.entries()) {
                if (target === aggregate) continue;
                const executionCount = new Set(paths.map((entry) => entry.invocationId)).size;
                if (executionCount !== 1) {
                    failures.push(
                        `${aggregate}: ${target} execution count must be 1; got ${executionCount}`,
                    );
                }
            }
        }

        return {
            sequence,
            counts: Object.fromEntries(
                [...occurrencePaths.entries()]
                    .filter(([target]) => target !== aggregate)
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

    for (const [aggregate, aggregateSpec] of Object.entries(contract?.aggregates ?? {})) {
        aggregateResults[aggregate] = analyzeAggregate(aggregate, aggregateSpec);
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
        const makeTargets = commands
            .filter((entry) => entry.command === "make")
            .flatMap((entry) => parseMakeArguments(entry.args ?? [], ".").targets);
        for (const target of spec.exactlyOnce ?? []) {
            const count = makeTargets.filter((candidate) => candidate === target).length;
            if (count !== 1) {
                failures.push(`standalone verify ${phase}: ${target} must execute exactly once; got ${count}`);
            }
        }
    }

    return { failures, aggregates: aggregateResults };
}
