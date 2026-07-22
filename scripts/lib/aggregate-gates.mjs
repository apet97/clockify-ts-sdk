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
    let commandSubstitutionDepth = 0;
    let unsupportedGrouping = false;
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
        if (char === "(") {
            if (commandLine[index - 1] === "$") {
                commandSubstitutionDepth += 1;
                token += char;
            } else {
                unsupportedGrouping = true;
                push();
                tokens.push(char);
            }
            continue;
        }
        if (char === ")") {
            if (commandSubstitutionDepth > 0) {
                commandSubstitutionDepth -= 1;
                token += char;
            } else {
                unsupportedGrouping = true;
                push();
                tokens.push(char);
            }
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
    return { tokens, unterminatedQuote: quote, unsupportedGrouping };
}

function commandSegments(commandLine) {
    const { tokens, unterminatedQuote, unsupportedGrouping } = shellTokens(commandLine);
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
    return { segments, unterminatedQuote, unsupportedGrouping };
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

function executableBasename(command) {
    if (typeof command !== "string" || command === "") return "";
    return path.posix.basename(command.replace(/\\/g, "/"));
}

function isMakeCommand(command) {
    return ["$(MAKE)", "$MAKE", "${MAKE}"].includes(command) ||
        ["make", "gmake"].includes(executableBasename(command));
}

function isMakeLikeToken(token) {
    if (typeof token !== "string") return false;
    const stripped = token.replace(/^\(+|\)+$/g, "");
    return isMakeCommand(stripped);
}

function makeMarkers(source) {
    if (typeof source !== "string" || source === "") return [];
    const dynamicPayload =
        /(?:^|[;&|]\s*)(?:eval\b|(?:[^\s;|&]*\/)?(?:node|python\d*)\b[^;|&]*\s-(?:e|c)\b|(?:[^\s;|&]*\/)?(?:ba|z|da)?sh\b[^;|&]*-[^-\s]*c|(?:[^\s;|&]*\/)?npx\b[^;|&]*(?:-c|--call))/i.test(
            source,
        );
    const quoteAt = (offset) => {
        let quote = null;
        let quoteStart = -1;
        for (let index = 0; index < offset; index += 1) {
            const char = source[index];
            if (char === "\\" && quote !== "'") {
                index += 1;
                continue;
            }
            if (quote == null && (char === '"' || char === "'")) {
                quote = char;
                quoteStart = index;
            } else if (char === quote) {
                quote = null;
                quoteStart = -1;
            }
        }
        return { quote, quoteStart };
    };
    return [
        ...source.matchAll(
            /\$\(\s*MAKE\s*\)|\$\{MAKE\}|\$MAKE|(?<![A-Za-z0-9_.+-])(?:[^\s"'`;|&()<>]*\/)?g?make(?=$|[\s"'`;|&()<>])/g,
        ),
    ]
        .map((match) => {
            const { quote, quoteStart } = quoteAt(match.index);
            const substitutionLike = /\$+\($/.test(
                source.slice(Math.max(0, match.index - 4), match.index),
            );
            const inertRunGuidance =
                quote != null &&
                !dynamicPayload &&
                /\brun\s+$/.test(source.slice(quoteStart + 1, match.index));
            return {
                value: match[0],
                requiresInvocation: !inertRunGuidance || substitutionLike,
            };
        });
}

function hasStrykerExecutableMarker(source) {
    return /(^|[^A-Za-z0-9])(?:@stryker-mutator(?:\/[^\s"'`;|&()]*)?|stryker(?:\.js)?)(?=$|[^A-Za-z0-9])/i.test(
        source,
    );
}

function isShellCommand(command) {
    return ["bash", "sh", "zsh", "dash"].includes(executableBasename(command));
}

function isShellCommandStringOption(option) {
    return option === "--command" || option.startsWith("--command=") || /^-[^-]*c/.test(option);
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

function parseNpmInvocation(command, args) {
    if (executableBasename(command) !== "npm") return null;
    const failures = [];
    const workspaceValues = [];
    const prefixValues = [];
    const positionals = [];
    const passthrough = [];
    const unknownOptions = [];
    let afterDoubleDash = false;

    function optionValue(option, value, collection) {
        if (typeof value !== "string" || value === "") {
            failures.push(`npm option ${option} requires a non-empty value`);
            return;
        }
        collection.push(value);
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (afterDoubleDash) {
            passthrough.push(arg);
            continue;
        }
        if (arg === "--") {
            afterDoubleDash = true;
            continue;
        }
        if (arg === "-w" || arg === "--workspace") {
            optionValue(arg, args[++index], workspaceValues);
            continue;
        }
        if (arg.startsWith("-w=")) {
            optionValue("-w", arg.slice(3), workspaceValues);
            continue;
        }
        if (arg.startsWith("--workspace=")) {
            optionValue("--workspace", arg.slice("--workspace=".length), workspaceValues);
            continue;
        }
        if (arg === "--prefix") {
            optionValue(arg, args[++index], prefixValues);
            continue;
        }
        if (arg.startsWith("--prefix=")) {
            optionValue("--prefix", arg.slice("--prefix=".length), prefixValues);
            continue;
        }
        if (arg === "-C") {
            optionValue(arg, args[++index], prefixValues);
            continue;
        }
        if (arg.startsWith("-C=")) {
            optionValue("-C", arg.slice(3), prefixValues);
            continue;
        }
        if (arg.startsWith("-")) {
            unknownOptions.push(arg);
            continue;
        }
        positionals.push(arg);
    }

    if (workspaceValues.length > 1) failures.push("npm workspace selection is ambiguous");
    if (prefixValues.length > 1) failures.push("npm prefix selection is ambiguous");
    if (workspaceValues.length > 0 && prefixValues.length > 0) {
        failures.push("npm workspace and prefix selectors are ambiguous when combined");
    }

    const subcommand = positionals[0] ?? null;
    let kind = "other";
    let script = null;
    let execArgs = [];
    if (subcommand === "run" || subcommand === "run-script") {
        kind = "script";
        script = positionals[1] ?? null;
        if (script == null) failures.push(`npm ${subcommand} requires a script name`);
        if (positionals.length > 2) failures.push(`npm ${subcommand} has ambiguous positional arguments`);
    } else if (["test", "t", "tst"].includes(subcommand)) {
        kind = "script";
        script = "test";
        if (positionals.length > 1) failures.push(`npm ${subcommand} has ambiguous positional arguments`);
    } else if (subcommand === "exec" || subcommand === "x") {
        kind = "exec";
        execArgs = [...positionals.slice(1), ...passthrough];
        if (execArgs.length === 0) failures.push(`npm ${subcommand} requires an executable`);
    } else if (subcommand == null && (workspaceValues.length > 0 || prefixValues.length > 0)) {
        failures.push("npm package selection is missing a subcommand");
    } else if (workspaceValues.length > 0 || prefixValues.length > 0) {
        failures.push(`unsupported npm package subcommand ${JSON.stringify(subcommand)}`);
    }

    if (unknownOptions.length > 0 && kind !== "other") {
        failures.push(`unsupported npm option(s): ${unknownOptions.join(", ")}`);
    }

    return {
        kind,
        subcommand,
        script,
        execArgs,
        workspace: workspaceValues[0] ?? null,
        prefix: prefixValues[0] ?? null,
        failures,
    };
}

function localMutationReason(command, args, npmInvocation = null) {
    const isStryker = (value) =>
        typeof value === "string" && hasStrykerExecutableMarker(value);
    if (isStryker(command)) return "direct Stryker execution";
    if (executableBasename(command) === "npx" && args.some(isStryker)) {
        return "Stryker execution through npx";
    }
    if (executableBasename(command) === "npm") {
        const invocation = npmInvocation ?? parseNpmInvocation(command, args);
        if (invocation?.kind === "script" && invocation.script === "mutation") {
            return "npm mutation package script";
        }
        if (invocation?.kind === "exec" && invocation.execArgs.some(isStryker)) {
            return `Stryker execution through npm ${invocation.subcommand}`;
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
        "maxCommandTokens",
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
    makefileDirectoryStateProvider = null,
    makefileFallbackProvider = null,
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
    const fallbackValidatedTargets = new Map();
    function modelFor(directory, commandPath) {
        const normalized = normalizeDirectory(directory);
        if (!allowedDirectories.has(normalized)) {
            failures.push(`${commandPath}: Make directory ${normalized} is outside allowed policy`);
            return null;
        }
        if (modelCache.has(normalized)) return modelCache.get(normalized);
        let source;
        let directoryState = normalized === "." ? "present" : null;
        let fallbackSource;
        if (normalized !== "." && makefileDirectoryStateProvider != null) {
            try {
                directoryState = makefileDirectoryStateProvider(normalized);
            } catch (error) {
                failures.push(`${commandPath}: ${normalized} directory state provider failed: ${error.message}`);
                modelCache.set(normalized, null);
                return null;
            }
            if (!["present", "absent"].includes(directoryState)) {
                failures.push(
                    `${commandPath}: ${normalized} directory state must be present or absent`,
                );
                modelCache.set(normalized, null);
                return null;
            }
        }
        try {
            source = normalized === "." ? makefileText : makefileProvider?.(normalized);
        } catch (error) {
            failures.push(`${commandPath}: ${normalized}/Makefile provider failed: ${error.message}`);
            modelCache.set(normalized, null);
            return null;
        }
        if (normalized !== "." && directoryState == null) {
            directoryState = typeof source === "string" ? "present" : "absent";
        }
        if (normalized !== ".") {
            try {
                fallbackSource = makefileFallbackProvider?.(normalized);
            } catch (error) {
                failures.push(`${commandPath}: ${normalized}/Makefile fallback provider failed: ${error.message}`);
            }
            if (typeof fallbackSource !== "string") {
                failures.push(`${commandPath}: ${normalized}/Makefile fallback is unavailable`);
            }
        }
        if (normalized !== "." && directoryState === "present" && typeof source !== "string") {
            failures.push(`${commandPath}: ${normalized} directory is present but Makefile is unavailable`);
            modelCache.set(normalized, null);
            return null;
        }
        if (typeof source !== "string" && directoryState !== "absent") {
            failures.push(`${commandPath}: ${normalized}/Makefile is unavailable`);
            modelCache.set(normalized, null);
            return null;
        }
        if (directoryState === "absent" && typeof fallbackSource !== "string") {
            failures.push(`${commandPath}: ${normalized}/Makefile and fallback are unavailable`);
            modelCache.set(normalized, null);
            return null;
        }
        const activeSource = directoryState === "absent" ? fallbackSource : source;
        const model = parseMakefile(activeSource);
        for (const failure of model.parseFailures) {
            failures.push(`${normalized}/Makefile: ${failure}`);
        }
        let fallbackModel = null;
        if (typeof fallbackSource === "string") {
            fallbackModel = parseMakefile(fallbackSource);
            for (const failure of fallbackModel.parseFailures) {
                failures.push(`${normalized}/Makefile fallback: ${failure}`);
            }
            if (fallbackModel.targets.size === 0) {
                failures.push(`${normalized}/Makefile fallback: contains no target definitions`);
            }
            for (const [target, lines] of fallbackModel.definitions.entries()) {
                if (lines.length > 1) {
                    failures.push(
                        `${normalized}/Makefile fallback target ${target} is defined more than once at ${lines
                            .map((line) => `line ${line}`)
                            .join(" and ")}`,
                    );
                }
            }
            fallbackValidatedTargets.set(normalized, new Set());
        }
        const entry = {
            model,
            fallbackModel,
            live: directoryState === "present",
        };
        modelCache.set(normalized, entry);
        return entry;
    }

    const rootModel = modelFor(".", "root aggregate graph")?.model ?? null;
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
        let commandTokenCount = 0;
        let packageScriptCount = 0;
        let stopped = false;

        function bounded(counter, maximum, label) {
            if (counter <= maximum) return false;
            failures.push(`${executionSpec?.name ?? rootTarget ?? "execution"}: ${label} exceeded ${maximum} bound`);
            stopped = true;
            return true;
        }

        const executionName = executionSpec?.name ?? rootTarget ?? label;

        function sourceAccounting(source, commandPath) {
            if (hasStrykerExecutableMarker(source)) {
                failures.push(`${commandPath}: reached source contains a Stryker executable marker`);
            }
            return {
                commandPath,
                markers: makeMarkers(source),
                accountedMakeInvocations: 0,
            };
        }

        function finishSourceAccounting(accounting) {
            const requiredMarkers = accounting.markers.filter((marker) => marker.requiresInvocation);
            if (accounting.accountedMakeInvocations < requiredMarkers.length) {
                failures.push(
                    `${accounting.commandPath}: unaccounted Make marker(s): inventoried ${accounting.markers.length}, requiring invocation ${requiredMarkers.length}, accounted ${accounting.accountedMakeInvocations}`,
                );
            }
        }

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
            const modelEntry = modelFor(normalizedDirectory, targetPath);
            if (modelEntry == null) return;
            const model = modelEntry.model;
            if (normalizedDirectory !== "." && modelEntry.fallbackModel != null) {
                const fallbackDefinition = modelEntry.fallbackModel.targets.get(target);
                const liveDefinition = model.targets.get(target);
                fallbackValidatedTargets.get(normalizedDirectory)?.add(target);
                if (fallbackDefinition == null) {
                    failures.push(
                        `${targetPath}: ${normalizedDirectory}/Makefile fallback is missing reached target ${target}`,
                    );
                } else if (liveDefinition != null && modelEntry.live) {
                    const liveShape = {
                        prerequisites: liveDefinition.prerequisites,
                        recipes: liveDefinition.recipes,
                        phony: model.phony.has(target),
                    };
                    const fallbackShape = {
                        prerequisites: fallbackDefinition.prerequisites,
                        recipes: fallbackDefinition.recipes,
                        phony: modelEntry.fallbackModel.phony.has(target),
                    };
                    if (JSON.stringify(liveShape) !== JSON.stringify(fallbackShape)) {
                        failures.push(
                            `${targetPath}: ${normalizedDirectory}/Makefile live/fallback drift for reached target ${target}`,
                        );
                    }
                }
            }
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

        function resolvePackageDirectory(invocation, directory, commandPath) {
            if (packageCatalog == null) {
                failures.push(`${commandPath}: package catalog is unavailable for npm script traversal`);
                return null;
            }
            if (invocation.workspace != null && invocation.prefix != null) return null;

            if (invocation.workspace != null) {
                const candidates = new Set();
                const byName = packageCatalog.byName?.[invocation.workspace];
                if (typeof byName === "string") candidates.add(normalizeDirectory(byName));
                if (!path.isAbsolute(invocation.workspace) && !/[$*?{}]/.test(invocation.workspace)) {
                    const byPath = normalizeDirectory(path.join(directory, invocation.workspace));
                    if (packageCatalog.byDirectory?.[byPath] != null) candidates.add(byPath);
                }
                if (candidates.size === 0) {
                    failures.push(
                        `${commandPath}: invoked npm workspace ${JSON.stringify(invocation.workspace)} is unknown or outside package policy`,
                    );
                    return null;
                }
                if (candidates.size > 1) {
                    failures.push(
                        `${commandPath}: invoked npm workspace ${JSON.stringify(invocation.workspace)} is ambiguous`,
                    );
                    return null;
                }
                return [...candidates][0];
            }

            if (invocation.prefix != null) {
                if (path.isAbsolute(invocation.prefix) || /[$*?{}]/.test(invocation.prefix)) {
                    failures.push(`${commandPath}: npm prefix is outside package policy`);
                    return null;
                }
                const selected = normalizeDirectory(path.join(directory, invocation.prefix));
                if (selected.startsWith("../") || packageCatalog.byDirectory?.[selected] == null) {
                    failures.push(
                        `${commandPath}: npm prefix ${JSON.stringify(invocation.prefix)} is unknown or outside package policy`,
                    );
                    return null;
                }
                return selected;
            }

            return normalizeDirectory(directory);
        }

        function visitPackageScript(
            invocation,
            directory,
            commandPath,
            invocationAncestry,
            scriptStack,
            depth,
        ) {
            if (invocation?.kind !== "script" || invocation.script == null) return;
            packageScriptCount += 1;
            if (bounded(packageScriptCount, bounds.maxPackageScripts, "maxPackageScripts")) return;
            if (bounded(depth + 1, bounds.maxDepth, "maxDepth")) return;
            const packageDirectory = resolvePackageDirectory(invocation, directory, commandPath);
            if (packageDirectory == null) return;
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
            accounting,
        ) {
            if (stopped) return;
            if (bounded(depth + 1, bounds.maxDepth, "maxDepth")) return;
            commandTokenCount += tokens.length;
            if (bounded(commandTokenCount, bounds.maxCommandTokens, "maxCommandTokens")) return;
            const { command, args } = unwrapCommand(tokens);
            if (command == null) return;
            if (isShellCommand(command) && args.some(isShellCommandStringOption)) {
                failures.push(
                    `${commandPath}: unsupported shell command indirection ${command} ${args.join(" ")}`,
                );
                return;
            }
            if (
                executableBasename(command) === "npx" &&
                args.some(
                    (arg) =>
                        arg === "-c" ||
                        arg === "--call" ||
                        arg.startsWith("--call=") ||
                        (arg.startsWith("-c") && arg.length > 2),
                )
            ) {
                failures.push(`${commandPath}: unsupported npx command-string option: ${args.join(" ")}`);
                return;
            }
            const npmInvocation = parseNpmInvocation(command, args);
            for (const failure of npmInvocation?.failures ?? []) {
                failures.push(`${commandPath}: ${failure}`);
            }
            let npmExecDirectory = directory;
            if (
                npmInvocation?.kind === "exec" &&
                (npmInvocation.workspace != null || npmInvocation.prefix != null)
            ) {
                npmExecDirectory = resolvePackageDirectory(npmInvocation, directory, commandPath);
            }
            const reason = localMutationReason(command, args, npmInvocation);
            if (reason != null) {
                failures.push(`${commandPath}: local mutation (${reason})`);
            }
            if (isMakeCommand(command)) {
                const parsed = parseMakeArguments(args, directory);
                for (const parseFailure of parsed.failures) {
                    failures.push(`${commandPath}: recursive make ${parseFailure}`);
                }
                if (parsed.failures.length === 0 && parsed.targets.length > 0) {
                    accounting.accountedMakeInvocations += 1;
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
                    const entryPath = `${commandPath} -> verify ${phase}[${index}]`;
                    const entrySource = [entry.command, ...(entry.args ?? [])].join(" ");
                    const entryAccounting = sourceAccounting(entrySource, entryPath);
                    walkCommandTokens(
                        [entry.command, ...(entry.args ?? [])],
                        ".",
                        entryPath,
                        invocationAncestry,
                        scriptStack,
                        depth + 1,
                        entryAccounting,
                    );
                    finishSourceAccounting(entryAccounting);
                }
                return;
            }
            if (npmInvocation?.kind === "exec") {
                if (npmExecDirectory != null && npmInvocation.execArgs.length > 0) {
                    walkCommandTokens(
                        npmInvocation.execArgs,
                        npmExecDirectory,
                        `${commandPath} -> npm ${npmInvocation.subcommand} payload`,
                        invocationAncestry,
                        scriptStack,
                        depth + 1,
                        accounting,
                    );
                }
                return;
            }
            visitPackageScript(
                npmInvocation,
                directory,
                commandPath,
                invocationAncestry,
                scriptStack,
                depth,
            );
            const makeLike = isMakeLikeToken(command) || args.some(isMakeLikeToken);
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
            existingAccounting = null,
        ) {
            const accounting = existingAccounting ?? sourceAccounting(commandLine, commandPath);
            const { segments, unterminatedQuote, unsupportedGrouping } = commandSegments(commandLine);
            if (unterminatedQuote != null) {
                failures.push(`${commandPath}: command has unterminated quote: ${commandLine}`);
            }
            if (unsupportedGrouping) {
                failures.push(`${commandPath}: unsupported parenthesized shell command grouping: ${commandLine}`);
                if (existingAccounting == null) finishSourceAccounting(accounting);
                return;
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
                    accounting,
                );
            }
            if (existingAccounting == null) finishSourceAccounting(accounting);
        }

        if (rootTarget != null) {
            visitInvocation([rootTarget], label);
        } else {
            for (const [index, entry] of (commands ?? []).entries()) {
                const rawSource = [entry.command, ...(entry.args ?? [])].join(" ");
                const accounting = sourceAccounting(rawSource, `${label}[${index}]`);
                walkCommandTokens(
                    [entry.command, ...(entry.args ?? [])],
                    ".",
                    `${label}[${index}]`,
                    [],
                    [],
                    0,
                    accounting,
                );
                finishSourceAccounting(accounting);
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
                    if (!isMakeCommand(descriptor.command)) continue;
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

    for (const [directory, entry] of modelCache.entries()) {
        if (directory === "." || entry?.fallbackModel == null) continue;
        const validated = fallbackValidatedTargets.get(directory) ?? new Set();
        const unreachable = [...entry.fallbackModel.targets.keys()].filter(
            (target) => !validated.has(target),
        );
        if (unreachable.length > 0) {
            failures.push(
                `${directory}/Makefile fallback contains target(s) outside the recursively reached graph: ${unreachable.join(", ")}`,
            );
        }
    }

    return { failures, aggregates: aggregateResults };
}
