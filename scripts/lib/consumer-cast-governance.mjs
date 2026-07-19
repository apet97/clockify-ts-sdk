import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const MAX_TRACE_DEPTH = 24;
const MAX_STATIC_ALTERNATIVES = 64;
const MAX_SYNTHETIC_INVOCATIONS = 256;
const MAX_ANALYSIS_WORK = 10000;

class AnalysisWorkLimitError extends Error {
    constructor(maxWork, largestCallbackExpansion = 0) {
        super(`consumer cast analysis limit exceeded (work; max ${maxWork})`);
        this.name = "AnalysisWorkLimitError";
        this.work = maxWork;
        this.largestCallbackExpansion = largestCallbackExpansion;
    }
}

async function listTypeScript(root, relativeRoot) {
    const files = [];
    const stack = [relativeRoot];
    while (stack.length > 0) {
        const directory = stack.pop();
        let entries;
        try {
            entries = await readdir(path.join(root, directory), { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const relativePath = path.join(directory, entry.name);
            if (entry.isDirectory()) stack.push(relativePath);
            else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relativePath);
        }
    }
    return files.sort();
}

function nonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function safeRelativePath(value) {
    if (!nonEmptyString(value) || path.isAbsolute(value)) return null;
    const normalized = path.normalize(value);
    if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) return null;
    return normalized;
}

async function readText(root, relativePath) {
    const safePath = safeRelativePath(relativePath);
    if (!safePath) return null;
    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        return null;
    }
}

function normalize(fileName) {
    return fileName.replaceAll("\\", "/");
}

function isGeneratedRequestDeclaration(declaration) {
    const fileName = normalize(declaration.getSourceFile().fileName);
    return (
        /\/(?:wrapper\/(?:src|dist\/(?:esm|cjs)\/src)|output\/ts-sdk)\/api\/resources\/.*\/client\/requests\//.test(
            fileName,
        ) ||
        /\/node_modules\/clockify-sdk-ts-115\/(?:requests\.d\.ts|dist\/(?:esm|cjs)\/src\/api\/resources\/.*\/client\/requests\/)/.test(
            fileName,
        )
    );
}

function unalias(checker, symbol) {
    let current = symbol;
    const seen = new Set();
    while (current && (current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
        seen.add(current);
        try {
            current = checker.getAliasedSymbol(current);
        } catch {
            break;
        }
    }
    return current;
}

function requestNameFromTypeNode(checker, node, seen = new Set()) {
    if (!node || seen.has(node)) return null;
    seen.add(node);
    if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) {
        return requestNameFromTypeNode(checker, node.type, seen);
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
        for (const child of node.types) {
            const name = requestNameFromTypeNode(checker, child, seen);
            if (name) return name;
        }
    }
    if (ts.isTupleTypeNode(node)) {
        for (const child of node.elements) {
            const name = requestNameFromTypeNode(checker, child, seen);
            if (name) return name;
        }
    }
    if (ts.isTypeReferenceNode(node)) {
        const symbol = unalias(checker, checker.getSymbolAtLocation(node.typeName));
        if (symbol) {
            if (
                /Request$/.test(symbol.getName()) &&
                (symbol.declarations ?? []).some(isGeneratedRequestDeclaration)
            ) {
                return symbol.getName();
            }
            for (const declaration of symbol.declarations ?? []) {
                if (ts.isTypeAliasDeclaration(declaration)) {
                    const name = requestNameFromTypeNode(checker, declaration.type, seen);
                    if (name) return name;
                }
            }
        }
        for (const argument of node.typeArguments ?? []) {
            const name = requestNameFromTypeNode(checker, argument, seen);
            if (name) return name;
        }
    }
    if (ts.isArrayTypeNode(node)) return requestNameFromTypeNode(checker, node.elementType, seen);
    return null;
}

function requestNameFromType(checker, type, seen = new Set()) {
    if (!type || seen.has(type)) return null;
    seen.add(type);
    for (const symbol of [type.aliasSymbol, type.getSymbol?.()]) {
        const target = unalias(checker, symbol);
        if (
            target &&
            /Request$/.test(target.getName()) &&
            (target.declarations ?? []).some(isGeneratedRequestDeclaration)
        ) {
            return target.getName();
        }
        for (const declaration of target?.declarations ?? []) {
            if (ts.isTypeAliasDeclaration(declaration)) {
                const name = requestNameFromTypeNode(checker, declaration.type);
                if (name) return name;
            }
        }
    }
    for (const argument of type.aliasTypeArguments ?? []) {
        const name = requestNameFromType(checker, argument, seen);
        if (name) return name;
    }
    if ((type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection)) !== 0) {
        for (const child of type.types ?? []) {
            const name = requestNameFromType(checker, child, seen);
            if (name) return name;
        }
    }
    if ((type.flags & ts.TypeFlags.Object) !== 0 && type.objectFlags & ts.ObjectFlags.Reference) {
        for (const argument of checker.getTypeArguments(type)) {
            const name = requestNameFromType(checker, argument, seen);
            if (name) return name;
        }
    }
    return null;
}

function typeContainsTypeParameter(checker, type, seen = new Set()) {
    if (!type || seen.has(type)) return false;
    seen.add(type);
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) return true;
    const children = [...(type.aliasTypeArguments ?? []), ...(type.types ?? [])];
    if ((type.flags & ts.TypeFlags.Object) !== 0 && type.objectFlags & ts.ObjectFlags.Reference) {
        children.push(...checker.getTypeArguments(type));
    }
    return children.some((child) => typeContainsTypeParameter(checker, child, seen));
}

function exactMakeTargets(closureGate) {
    if (!nonEmptyString(closureGate)) return new Set();
    const targets = new Set();
    for (const match of closureGate.matchAll(
        /(?:^|[;&|]\s*|\n\s*)make(?:\s+--?[\w-]+(?:=[^\s]+)?)?\s+([A-Za-z0-9][A-Za-z0-9_.-]*)/g,
    )) {
        targets.add(match[1]);
    }
    return targets;
}

function makefileHasExactTarget(makefile, target) {
    if (!nonEmptyString(makefile) || !nonEmptyString(target)) return false;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}\\s*:`, "m").test(makefile);
}

function sourceRelative(root, sourceFile) {
    const relative = path.relative(root, sourceFile.fileName);
    return normalize(relative || path.basename(sourceFile.fileName));
}

function nodeLine(sourceFile, node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function functionDisplayName(declaration) {
    if (declaration.name && ts.isIdentifier(declaration.name)) return declaration.name.text;
    if (ts.isVariableDeclaration(declaration.parent) && ts.isIdentifier(declaration.parent.name)) {
        return declaration.parent.name.text;
    }
    if (ts.isPropertyAssignment(declaration.parent)) return declaration.parent.name.getText();
    return "anonymous";
}

function functionReturnExpressions(declaration) {
    if (!declaration.body) return [];
    if (!ts.isBlock(declaration.body)) return [declaration.body];
    const returns = [];
    function visit(node) {
        if (node !== declaration && ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node) && node.expression) returns.push(node.expression);
        ts.forEachChild(node, visit);
    }
    visit(declaration.body);
    return returns;
}

function createProgram(rootNames) {
    return ts.createProgram({
        rootNames,
        options: {
            allowJs: false,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: ts.ScriptTarget.ES2022,
        },
    });
}

function analyzeProgram({
    root,
    rootNames,
    packageRoots,
    forbiddenIdentifier,
    analysisLimits = {},
}) {
    const program = createProgram(rootNames);
    const checker = program.getTypeChecker();
    const findings = [];
    const findingKeys = new Set();
    const writesBySymbol = new Map();
    const propertyWrites = [];
    const wildcardPropertyWrites = [];
    const callArgumentsByParameter = new Map();
    const callsByDeclaration = new Map();
    const analysisFailures = new Set();
    const maxAlternatives = analysisLimits.maxAlternatives ?? MAX_STATIC_ALTERNATIVES;
    const maxInvocations = analysisLimits.maxInvocations ?? MAX_SYNTHETIC_INVOCATIONS;
    const maxWork = analysisLimits.maxWork ?? MAX_ANALYSIS_WORK;
    let analysisWork = 0;
    let analysisExhausted = false;
    let largestCallbackExpansion = 0;
    let syntheticInvocations = 0;

    function bounded(values, kind = "alternatives") {
        if (analysisExhausted) return [];
        if (analysisWork + values.length > maxWork) {
            analysisWork = maxWork;
            analysisExhausted = true;
            throw new AnalysisWorkLimitError(maxWork, largestCallbackExpansion);
        }
        analysisWork += values.length;
        if (values.length > maxAlternatives) {
            analysisFailures.add(
                `consumer cast analysis limit exceeded (${kind}; max ${maxAlternatives})`,
            );
            return values.slice(0, maxAlternatives);
        }
        return values;
    }

    function boundedCallbackConcat(left, right) {
        const combinedLength = left.length + right.length;
        if (analysisWork + combinedLength > maxWork) {
            analysisWork = maxWork;
            analysisExhausted = true;
            largestCallbackExpansion = maxWork;
            throw new AnalysisWorkLimitError(maxWork, largestCallbackExpansion);
        }
        analysisWork += combinedLength;
        largestCallbackExpansion = Math.max(largestCallbackExpansion, combinedLength);
        if (combinedLength > maxAlternatives) {
            analysisFailures.add(
                `consumer cast analysis limit exceeded (callback return alternatives; max ${maxAlternatives})`,
            );
        }
        const combined = left.slice(0, maxAlternatives);
        const remaining = maxAlternatives - combined.length;
        if (remaining > 0) combined.push(...right.slice(0, remaining));
        return combined;
    }

    function addSyntheticInvocation(declaration, node, args) {
        if (analysisExhausted) return;
        syntheticInvocations += 1;
        if (syntheticInvocations > maxInvocations) {
            analysisFailures.add(
                `consumer cast analysis limit exceeded (invocations; max ${maxInvocations})`,
            );
            return;
        }
        addInvocation(declaration, node, args);
    }

    function addInvocation(declaration, node, args) {
        if (!declaration || !ts.isFunctionLike(declaration)) return;
        const invocation = { node, arguments: [...args] };
        const calls = callsByDeclaration.get(declaration) ?? [];
        if (
            !calls.some(
                (existing) =>
                    existing.node === node &&
                    existing.arguments.length === invocation.arguments.length &&
                    existing.arguments.every(
                        (argument, index) => argument === invocation.arguments[index],
                    ),
            )
        ) {
            calls.push(invocation);
            callsByDeclaration.set(declaration, calls);
        }
        declaration.parameters.forEach((parameter, index) => {
            const argument = invocation.arguments[index];
            if (!argument || !ts.isIdentifier(parameter.name)) return;
            const symbol = unalias(checker, checker.getSymbolAtLocation(parameter.name));
            if (!symbol) return;
            const inputs = callArgumentsByParameter.get(symbol) ?? [];
            inputs.push(argument);
            callArgumentsByParameter.set(symbol, inputs);
        });
    }

    function literalPropertyNames(type) {
        if ((type.flags & ts.TypeFlags.StringLiteral) !== 0) return [type.value];
        if ((type.flags & ts.TypeFlags.NumberLiteral) !== 0) return [String(type.value)];
        if ((type.flags & ts.TypeFlags.Union) !== 0) {
            const names = type.types.flatMap((child) => literalPropertyNames(child) ?? []);
            return names.length === type.types.length ? names : null;
        }
        return null;
    }

    function computedPropertyNames(target) {
        const argument = target.argumentExpression;
        if (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument)) {
            return [argument.text];
        }
        return literalPropertyNames(checker.getTypeAtLocation(argument));
    }

    function symbolsForWriteTarget(target) {
        if (ts.isIdentifier(target)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(target));
            return symbol ? [symbol] : [];
        }
        if (ts.isPropertyAccessExpression(target)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(target.name));
            return symbol ? [symbol] : [];
        }
        if (ts.isElementAccessExpression(target)) {
            const names = computedPropertyNames(target);
            if (names == null) return [];
            const receiverType = checker.getApparentType(
                checker.getTypeAtLocation(target.expression),
            );
            return [
                ...new Set(
                    names
                        .map((name) =>
                            unalias(checker, checker.getPropertyOfType(receiverType, name)),
                        )
                        .filter(Boolean),
                ),
            ];
        }
        return [];
    }

    function symbolForWriteTarget(target) {
        return symbolsForWriteTarget(target)[0] ?? null;
    }

    function addWrite(target, value, position, declaredType = null, options = {}) {
        const write = {
            value,
            position,
            sourceFile: target.getSourceFile(),
            node: target,
            declaredType,
            ...options,
        };
        const symbols = options.symbols ?? symbolsForWriteTarget(target);
        if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
            write.propertyNames = ts.isPropertyAccessExpression(target)
                ? [target.name.text]
                : computedPropertyNames(target);
            propertyWrites.push(write);
        }
        if (
            symbols.length === 0 &&
            (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))
        ) {
            write.propertyNames = ts.isPropertyAccessExpression(target)
                ? [target.name.text]
                : computedPropertyNames(target);
            wildcardPropertyWrites.push(write);
            return;
        }
        for (const symbol of symbols) {
            const writes = writesBySymbol.get(symbol) ?? [];
            writes.push(write);
            writesBySymbol.set(symbol, writes);
        }
    }

    function literalObjectProperty(source, names) {
        if (!ts.isObjectLiteralExpression(source) || names == null) return null;
        for (const property of source.properties) {
            const propertyNames = property.name
                ? ts.isComputedPropertyName(property.name)
                    ? literalPropertyNames(checker.getTypeAtLocation(property.name.expression))
                    : [property.name.getText(source.getSourceFile()).replace(/^['"]|['"]$/g, "")]
                : [];
            if (!propertyNames?.some((name) => names.includes(name))) continue;
            if (ts.isPropertyAssignment(property)) return property.initializer;
            if (ts.isShorthandPropertyAssignment(property)) return property.name;
        }
        return null;
    }

    function indexDestructuringWrites(pattern, source, position, projection = []) {
        if (ts.isParenthesizedExpression(pattern)) {
            indexDestructuringWrites(pattern.expression, source, position, projection);
            return;
        }
        if (ts.isObjectLiteralExpression(pattern)) {
            const excluded = pattern.properties
                .filter((property) => !ts.isSpreadAssignment(property) && property.name)
                .flatMap((property) =>
                    ts.isComputedPropertyName(property.name)
                        ? (literalPropertyNames(
                              checker.getTypeAtLocation(property.name.expression),
                          ) ?? [])
                        : [
                              property.name
                                  .getText(pattern.getSourceFile())
                                  .replace(/^['"]|['"]$/g, ""),
                          ],
                );
            for (const property of pattern.properties) {
                if (ts.isSpreadAssignment(property)) {
                    addWrite(property.expression, source, position, null, {
                        projection: [...projection, { kind: "objectRest", excluded }],
                    });
                    continue;
                }
                const target = ts.isShorthandPropertyAssignment(property)
                    ? property.name
                    : ts.isPropertyAssignment(property)
                      ? property.initializer
                      : null;
                if (!target) continue;
                const names = property.name
                    ? ts.isComputedPropertyName(property.name)
                        ? literalPropertyNames(checker.getTypeAtLocation(property.name.expression))
                        : [
                              property.name
                                  .getText(pattern.getSourceFile())
                                  .replace(/^['"]|['"]$/g, ""),
                          ]
                    : null;
                const nextProjection = [...projection, { kind: "property", names: names ?? [] }];
                const selected = literalObjectProperty(source, names);
                if (
                    ts.isBinaryExpression(target) &&
                    target.operatorToken.kind === ts.SyntaxKind.EqualsToken
                ) {
                    addWrite(target.left, selected ?? source, position, null, {
                        projection: selected ? [] : nextProjection,
                        defaultValue: target.right,
                    });
                    continue;
                }
                if (ts.isObjectLiteralExpression(target) || ts.isArrayLiteralExpression(target)) {
                    indexDestructuringWrites(
                        target,
                        selected ?? source,
                        position,
                        selected ? [] : nextProjection,
                    );
                } else if (
                    ts.isIdentifier(target) ||
                    ts.isPropertyAccessExpression(target) ||
                    ts.isElementAccessExpression(target)
                ) {
                    const shorthandSymbol = ts.isShorthandPropertyAssignment(property)
                        ? unalias(checker, checker.getShorthandAssignmentValueSymbol(property))
                        : null;
                    addWrite(target, selected ?? source, position, null, {
                        symbols: shorthandSymbol ? [shorthandSymbol] : undefined,
                        projection: selected ? [] : nextProjection,
                        defaultValue: ts.isShorthandPropertyAssignment(property)
                            ? property.objectAssignmentInitializer
                            : undefined,
                    });
                }
            }
            return;
        }
        if (ts.isArrayLiteralExpression(pattern)) {
            pattern.elements.forEach((target, index) => {
                if (ts.isOmittedExpression(target)) return;
                if (ts.isSpreadElement(target)) {
                    addWrite(target.expression, source, position, null, {
                        projection: [...projection, { kind: "arrayRest", start: index }],
                    });
                    return;
                }
                const selected =
                    ts.isArrayLiteralExpression(source) && source.elements[index]
                        ? source.elements[index]
                        : null;
                const nextProjection = [...projection, { kind: "array", index }];
                if (
                    ts.isBinaryExpression(target) &&
                    target.operatorToken.kind === ts.SyntaxKind.EqualsToken
                ) {
                    addWrite(target.left, selected ?? source, position, null, {
                        projection: selected ? [] : nextProjection,
                        defaultValue: target.right,
                    });
                    return;
                }
                if (ts.isObjectLiteralExpression(target) || ts.isArrayLiteralExpression(target)) {
                    indexDestructuringWrites(
                        target,
                        selected ?? source,
                        position,
                        selected ? [] : nextProjection,
                    );
                } else if (
                    ts.isIdentifier(target) ||
                    ts.isPropertyAccessExpression(target) ||
                    ts.isElementAccessExpression(target)
                ) {
                    addWrite(target, selected ?? source, position, null, {
                        projection: selected ? [] : nextProjection,
                    });
                }
            });
        }
    }

    function indexBindingPatternWrites(pattern, source, position, projection = []) {
        if (ts.isObjectBindingPattern(pattern)) {
            for (const element of pattern.elements) {
                if (element.dotDotDotToken) continue;
                const property = element.propertyName ?? element.name;
                if (!ts.isIdentifier(property) && !ts.isStringLiteralLike(property)) continue;
                const names = [property.text];
                const nextProjection = [...projection, { kind: "property", names }];
                if (ts.isIdentifier(element.name)) {
                    addWrite(element.name, source, position, null, {
                        projection: nextProjection,
                        defaultValue: element.initializer,
                    });
                } else {
                    indexBindingPatternWrites(element.name, source, position, nextProjection);
                }
            }
            return;
        }
        if (ts.isArrayBindingPattern(pattern)) {
            pattern.elements.forEach((element, index) => {
                if (!ts.isBindingElement(element) || element.dotDotDotToken) return;
                const nextProjection = [...projection, { kind: "array", index }];
                if (ts.isIdentifier(element.name)) {
                    addWrite(element.name, source, position, null, {
                        projection: nextProjection,
                        defaultValue: element.initializer,
                    });
                } else {
                    indexBindingPatternWrites(element.name, source, position, nextProjection);
                }
            });
        }
    }

    function definiteExpressionState(expression) {
        while (
            ts.isParenthesizedExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression) ||
            ts.isSatisfiesExpression(expression)
        ) {
            expression = expression.expression;
        }
        if (
            ts.isObjectLiteralExpression(expression) ||
            ts.isArrayLiteralExpression(expression) ||
            ts.isFunctionExpression(expression) ||
            ts.isArrowFunction(expression) ||
            ts.isClassExpression(expression) ||
            ts.isNewExpression(expression)
        ) {
            return { nullish: false, truthy: true };
        }
        if (expression.kind === ts.SyntaxKind.NullKeyword) return { nullish: true, truthy: false };
        if (ts.isIdentifier(expression) && expression.text === "undefined") {
            return { nullish: true, truthy: false };
        }
        if (ts.isStringLiteralLike(expression)) {
            return { nullish: false, truthy: expression.text.length > 0 };
        }
        if (ts.isNumericLiteral(expression)) {
            return { nullish: false, truthy: Number(expression.text) !== 0 };
        }
        if (expression.kind === ts.SyntaxKind.TrueKeyword) return { nullish: false, truthy: true };
        if (expression.kind === ts.SyntaxKind.FalseKeyword)
            return { nullish: false, truthy: false };
        return { nullish: null, truthy: null };
    }

    function compoundRightMayExecute(target, operator) {
        const symbol = symbolForWriteTarget(target);
        const names = ts.isPropertyAccessExpression(target)
            ? [target.name.text]
            : ts.isElementAccessExpression(target)
              ? computedPropertyNames(target)
              : null;
        const candidates = (
            ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)
                ? [...propertyWrites, ...wildcardPropertyWrites].filter(
                      (write) =>
                          (write.propertyNames == null ||
                              names == null ||
                              write.propertyNames.some((name) => names.includes(name))) &&
                          write.position < target.pos &&
                          write.sourceFile === target.getSourceFile() &&
                          writeMayReachExpression(write, target),
                  )
                : (writesBySymbol.get(symbol) ?? [])
        ).sort((left, right) => left.position - right.position);
        const previous = candidates.at(-1);
        const previousLocation = previous ? directStatementInLinearContainer(previous.node) : null;
        const targetLocation = directStatementInLinearContainer(target);
        let direct = false;
        if (previous?.conditional) {
            direct = false;
        } else if (previousLocation && ts.isVariableStatement(previousLocation.statement)) {
            direct = ts.isVariableDeclaration(previous.node.parent);
        } else if (previousLocation && ts.isExpressionStatement(previousLocation.statement)) {
            let expression = previousLocation.statement.expression;
            while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
            direct =
                ts.isBinaryExpression(expression) &&
                expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                expression.left === previous.node;
        }
        if (direct && targetLocation && previousLocation.container !== targetLocation.container) {
            direct = false;
        }
        let value = direct ? previous.value : null;
        if (
            !value &&
            (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))
        ) {
            const propertyName = names?.length === 1 ? names[0] : null;
            const initialValues = propertyName
                ? propertyValueExpressions(target.expression, propertyName)
                : [];
            if (initialValues.length === 1) value = initialValues[0];
        }
        if (!value) return true;
        const state = definiteExpressionState(value);
        if (operator === ts.SyntaxKind.QuestionQuestionEqualsToken) return state.nullish !== false;
        if (operator === ts.SyntaxKind.BarBarEqualsToken) return state.truthy !== true;
        if (operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken) return state.truthy !== false;
        return true;
    }

    function isWithin(node, container) {
        for (let current = node; current; current = current.parent) {
            if (current === container) return true;
            if (current === container.parent) return false;
        }
        return false;
    }

    function expressionDefinitelySkipped(node) {
        for (let current = node.parent; current; current = current.parent) {
            if (!ts.isBinaryExpression(current) || !isWithin(node, current.right)) continue;
            const state = definiteExpressionState(current.left);
            if (
                (current.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
                    state.truthy === true) ||
                (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
                    state.truthy === false) ||
                (current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
                    state.nullish === false)
            ) {
                return true;
            }
        }
        return false;
    }

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        function indexWrites(node) {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
                addWrite(node.name, node.initializer, node.pos, node.type);
            }
            if (
                ts.isVariableDeclaration(node) &&
                (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) &&
                node.initializer
            ) {
                indexBindingPatternWrites(node.name, node.initializer, node.pos);
            }
            if (ts.isPropertyDeclaration(node) && node.initializer) {
                addWrite(node.name, node.initializer, node.pos, node.type);
            }
            if (
                ts.isBinaryExpression(node) &&
                (ts.isIdentifier(node.left) ||
                    ts.isPropertyAccessExpression(node.left) ||
                    ts.isElementAccessExpression(node.left)) &&
                [
                    ts.SyntaxKind.EqualsToken,
                    ts.SyntaxKind.QuestionQuestionEqualsToken,
                    ts.SyntaxKind.BarBarEqualsToken,
                    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
                ].includes(node.operatorToken.kind)
            ) {
                if (
                    node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
                    compoundRightMayExecute(node.left, node.operatorToken.kind)
                ) {
                    addWrite(node.left, node.right, node.pos, null, {
                        conditional: node.operatorToken.kind !== ts.SyntaxKind.EqualsToken,
                    });
                }
            }
            if (
                ts.isBinaryExpression(node) &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                (ts.isObjectLiteralExpression(node.left) || ts.isArrayLiteralExpression(node.left))
            ) {
                indexDestructuringWrites(node.left, node.right, node.pos);
            }
            ts.forEachChild(node, indexWrites);
        }
        indexWrites(sourceFile);
    }

    function functionDeclarationForExpression(expression) {
        return checker
            .getTypeAtLocation(expression)
            .getCallSignatures()
            .map((signature) => signature.declaration)
            .find((declaration) => declaration && ts.isFunctionLike(declaration));
    }

    function unwrapExpression(expression) {
        while (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression) ||
            ts.isSatisfiesExpression(expression)
        ) {
            expression = expression.expression;
        }
        return expression;
    }

    function isGlobalBuiltin(expression, name) {
        if (!ts.isIdentifier(expression) || expression.text !== name) return false;
        const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
        return (symbol?.declarations ?? []).some(
            (declaration) =>
                declaration.getSourceFile().isDeclarationFile &&
                /\/lib\.[^/]+\.d\.ts$/.test(normalize(declaration.getSourceFile().fileName)),
        );
    }

    function reachingExpressionValues(
        expression,
        beforePosition,
        seen = new Set(),
        substitutions = new Map(),
    ) {
        expression = unwrapExpression(expression);
        if (ts.isConditionalExpression(expression)) {
            return bounded([
                ...reachingExpressionValues(
                    expression.whenTrue,
                    beforePosition,
                    seen,
                    substitutions,
                ),
                ...reachingExpressionValues(
                    expression.whenFalse,
                    beforePosition,
                    seen,
                    substitutions,
                ),
            ]);
        }
        if (ts.isBinaryExpression(expression)) {
            if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
                return reachingExpressionValues(
                    expression.right,
                    beforePosition,
                    seen,
                    substitutions,
                );
            }
            if (
                [
                    ts.SyntaxKind.BarBarToken,
                    ts.SyntaxKind.AmpersandAmpersandToken,
                    ts.SyntaxKind.QuestionQuestionToken,
                ].includes(expression.operatorToken.kind)
            ) {
                return bounded([
                    ...reachingExpressionValues(
                        expression.left,
                        beforePosition,
                        seen,
                        substitutions,
                    ),
                    ...reachingExpressionValues(
                        expression.right,
                        beforePosition,
                        seen,
                        substitutions,
                    ),
                ]);
            }
        }
        if (ts.isIdentifier(expression)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
            const substituted = substitutions.get(symbol);
            if (substituted) {
                return reachingExpressionValues(substituted, beforePosition, seen, substitutions);
            }
            if (!symbol || seen.has(symbol) || isGlobalBuiltin(expression, expression.text)) {
                return [{ expression, substitutions }];
            }
            const nextSeen = new Set(seen);
            nextSeen.add(symbol);
            const cutoff = latestDefiniteWriteCutoff(symbol, expression);
            const writes = (writesBySymbol.get(symbol) ?? []).filter(
                (write) =>
                    write.position < beforePosition && (cutoff == null || write.position >= cutoff),
            );
            return writes.length === 0
                ? [{ expression, substitutions }]
                : bounded(
                      writes.flatMap((write) =>
                          reachingExpressionValues(
                              write.value,
                              write.position,
                              nextSeen,
                              substitutions,
                          ),
                      ),
                  );
        }
        if (ts.isCallExpression(expression)) {
            const declaration = functionDeclarationForExpression(expression.expression);
            if (declaration?.body) {
                const key = `${declaration.getSourceFile().fileName}:${declaration.pos}:return`;
                if (seen.has(key)) return [];
                const nextSeen = new Set(seen);
                nextSeen.add(key);
                const nested = new Map(substitutions);
                declaration.parameters.forEach((parameter, index) => {
                    const argument = expression.arguments[index];
                    if (!argument) return;
                    const symbol = unalias(checker, checker.getSymbolAtLocation(parameter.name));
                    if (symbol) nested.set(symbol, argument);
                });
                return bounded(
                    functionReturnExpressions(declaration).flatMap((returned) =>
                        reachingExpressionValues(returned, expression.pos, nextSeen, nested),
                    ),
                );
            }
        }
        return [{ expression, substitutions }];
    }

    function objectPropertyEntries(
        source,
        beforePosition,
        seen = new Set(),
        substitutions = new Map(),
    ) {
        const entries = [];
        for (const value of reachingExpressionValues(source, beforePosition, seen, substitutions)) {
            const expression = unwrapExpression(value.expression);
            if (!ts.isObjectLiteralExpression(expression)) continue;
            for (const property of expression.properties) {
                if (ts.isSpreadAssignment(property)) {
                    entries.push(
                        ...objectPropertyEntries(
                            property.expression,
                            beforePosition,
                            seen,
                            value.substitutions,
                        ),
                    );
                    continue;
                }
                if (!property.name) continue;
                const names = ts.isComputedPropertyName(property.name)
                    ? literalPropertyNames(checker.getTypeAtLocation(property.name.expression))
                    : [
                          property.name
                              .getText(expression.getSourceFile())
                              .replace(/^['"]|['"]$/g, ""),
                      ];
                if (ts.isPropertyAssignment(property)) {
                    entries.push({
                        value: property.initializer,
                        names,
                        substitutions: value.substitutions,
                    });
                } else if (ts.isShorthandPropertyAssignment(property)) {
                    entries.push({
                        value: property.name,
                        names,
                        substitutions: value.substitutions,
                    });
                } else if (ts.isGetAccessorDeclaration(property)) {
                    for (const returned of functionReturnExpressions(property)) {
                        entries.push({
                            value: returned,
                            names,
                            substitutions: value.substitutions,
                        });
                    }
                }
            }
        }
        return entries;
    }

    function objectPropertySequences(
        source,
        beforePosition,
        seen = new Set(),
        substitutions = new Map(),
    ) {
        const alternatives = [];
        for (const value of reachingExpressionValues(source, beforePosition, seen, substitutions)) {
            const expression = unwrapExpression(value.expression);
            if (!ts.isObjectLiteralExpression(expression)) continue;
            let sequences = [[]];
            for (const property of expression.properties) {
                if (ts.isSpreadAssignment(property)) {
                    const spreadAlternatives = objectPropertySequences(
                        property.expression,
                        beforePosition,
                        seen,
                        value.substitutions,
                    );
                    if (spreadAlternatives.length > 0) {
                        sequences = bounded(
                            sequences.flatMap((sequence) =>
                                spreadAlternatives.map((spread) => [...sequence, ...spread]),
                            ),
                        );
                    } else {
                        const unresolved = {
                            value: property.expression,
                            names: null,
                            substitutions: value.substitutions,
                        };
                        sequences = sequences.map((sequence) => [...sequence, unresolved]);
                    }
                    continue;
                }
                if (!property.name) continue;
                const names = ts.isComputedPropertyName(property.name)
                    ? literalPropertyNames(checker.getTypeAtLocation(property.name.expression))
                    : [
                          property.name
                              .getText(expression.getSourceFile())
                              .replace(/^['"]|['"]$/g, ""),
                      ];
                const entries = ts.isPropertyAssignment(property)
                    ? [
                          {
                              value: property.initializer,
                              names,
                              substitutions: value.substitutions,
                          },
                      ]
                    : ts.isShorthandPropertyAssignment(property)
                      ? [
                            {
                                value: property.name,
                                names,
                                substitutions: value.substitutions,
                            },
                        ]
                      : ts.isGetAccessorDeclaration(property)
                        ? functionReturnExpressions(property).map((returned) => ({
                              value: returned,
                              names,
                              substitutions: value.substitutions,
                          }))
                        : ts.isMethodDeclaration(property)
                          ? [
                                {
                                    value: property,
                                    names,
                                    substitutions: value.substitutions,
                                },
                            ]
                          : [];
                if (entries.length > 0) {
                    sequences = bounded(
                        sequences.flatMap((sequence) =>
                            entries.map((entry) => [...sequence, entry]),
                        ),
                    );
                }
            }
            alternatives.push(...sequences);
        }
        return bounded(alternatives);
    }

    function getterEffectValues(entry, beforePosition) {
        const effects = [];
        for (const candidate of reachingExpressionValues(
            entry.value,
            beforePosition,
            new Set(),
            entry.substitutions,
        )) {
            const expression = unwrapExpression(candidate.expression);
            const declaration = ts.isFunctionLike(expression)
                ? expression
                : functionDeclarationForExpression(expression);
            if (!declaration?.body) {
                effects.push({
                    value: candidate.expression,
                    names: entry.names,
                    substitutions: candidate.substitutions,
                });
                continue;
            }
            for (const returned of functionReturnExpressions(declaration)) {
                effects.push({
                    value: returned,
                    names: entry.names,
                    substitutions: candidate.substitutions,
                });
            }
        }
        return bounded(effects, "getter return alternatives");
    }

    function descriptorEffectSequences(descriptor, beforePosition) {
        let sequences = objectPropertySequences(descriptor, beforePosition);
        if (sequences.length === 0) {
            sequences = [
                [
                    {
                        value: descriptor,
                        names: null,
                        substitutions: new Map(),
                    },
                ],
            ];
        }
        return bounded(
            sequences.map((sequence) => {
                const effects = [];
                for (const entry of sequence) {
                    if (entry.names == null) {
                        effects.push(entry);
                    } else if (entry.names.includes("value")) {
                        effects.push(entry);
                    } else if (entry.names.includes("get")) {
                        effects.push(...getterEffectValues(entry, beforePosition));
                    }
                }
                return effects;
            }),
            "descriptor path alternatives",
        );
    }

    function definePropertiesEffectPaths(descriptors, beforePosition) {
        let mapPaths = objectPropertySequences(descriptors, beforePosition);
        if (mapPaths.length === 0) {
            mapPaths = [
                [
                    {
                        value: descriptors,
                        names: null,
                        substitutions: new Map(),
                    },
                ],
            ];
        }
        const finalPaths = [];
        for (const mapPath of mapPaths) {
            let paths = [[]];
            for (const descriptor of mapPath) {
                if (descriptor.names == null) {
                    paths = bounded(
                        paths.map((path) => [...path, descriptor]),
                        "defineProperties wildcard paths",
                    );
                    continue;
                }
                const descriptorPaths = descriptorEffectSequences(
                    descriptor.value,
                    beforePosition,
                ).map((path) =>
                    path.map((effect) => ({
                        ...effect,
                        names: descriptor.names,
                    })),
                );
                paths = bounded(
                    paths.flatMap((path) =>
                        descriptorPaths.map((descriptorPath) => [...path, ...descriptorPath]),
                    ),
                    "defineProperties descriptor paths",
                );
            }
            finalPaths.push(...paths);
        }
        return bounded(finalPaths, "defineProperties map paths");
    }

    function expressionResolvesToGlobal(expression, name, beforePosition, seen = new Set()) {
        expression = unwrapExpression(expression);
        if (isGlobalBuiltin(expression, name)) return true;
        if (!ts.isIdentifier(expression)) return false;
        const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
        if (!symbol || seen.has(symbol)) return false;
        const nextSeen = new Set(seen);
        nextSeen.add(symbol);
        const cutoff = latestDefiniteWriteCutoff(symbol, expression);
        return (writesBySymbol.get(symbol) ?? [])
            .filter(
                (write) =>
                    write.position < beforePosition && (cutoff == null || write.position >= cutoff),
            )
            .some((write) =>
                expressionResolvesToGlobal(write.value, name, write.position, nextSeen),
            );
    }

    function reachingPropertyNames(expression, beforePosition) {
        return reachingExpressionValues(expression, beforePosition).flatMap((value) => {
            const argument = unwrapExpression(value.expression);
            if (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument)) {
                return [argument.text];
            }
            return literalPropertyNames(checker.getTypeAtLocation(argument)) ?? [];
        });
    }

    function expressionResolvesToBuiltinMember(
        expression,
        globalName,
        memberName,
        beforePosition,
        seen = new Set(),
    ) {
        expression = unwrapExpression(expression);
        if (
            ts.isPropertyAccessExpression(expression) &&
            expression.name.text === memberName &&
            expressionResolvesToGlobal(expression.expression, globalName, beforePosition)
        ) {
            return true;
        }
        if (
            ts.isElementAccessExpression(expression) &&
            expression.argumentExpression &&
            reachingPropertyNames(expression.argumentExpression, beforePosition).includes(
                memberName,
            ) &&
            expressionResolvesToGlobal(expression.expression, globalName, beforePosition)
        ) {
            return true;
        }
        if (ts.isIdentifier(expression)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
            if (!symbol || seen.has(symbol)) return false;
            const nextSeen = new Set(seen);
            nextSeen.add(symbol);
            const cutoff = latestDefiniteWriteCutoff(symbol, expression);
            return (writesBySymbol.get(symbol) ?? [])
                .filter(
                    (write) =>
                        write.position < beforePosition &&
                        (cutoff == null || write.position >= cutoff),
                )
                .some((write) => {
                    const projectedMember = write.projection?.at(-1);
                    if (
                        projectedMember?.kind === "property" &&
                        projectedMember.names.includes(memberName) &&
                        expressionResolvesToGlobal(
                            write.value,
                            globalName,
                            write.position,
                            nextSeen,
                        )
                    ) {
                        return true;
                    }
                    return expressionResolvesToBuiltinMember(
                        write.value,
                        globalName,
                        memberName,
                        write.position,
                        nextSeen,
                    );
                });
        }
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
            const memberNames = ts.isPropertyAccessExpression(expression)
                ? [expression.name.text]
                : expression.argumentExpression
                  ? reachingPropertyNames(expression.argumentExpression, beforePosition)
                  : [];
            return objectPropertyEntries(expression.expression, beforePosition).some(
                (entry) =>
                    entry.names?.some((name) => memberNames.includes(name)) &&
                    expressionResolvesToBuiltinMember(
                        entry.value,
                        globalName,
                        memberName,
                        beforePosition,
                        seen,
                    ),
            );
        }
        return false;
    }

    function addEffectWrite(
        receiver,
        value,
        propertyNames,
        call,
        substitutions = new Map(),
        effectGroup = null,
        effectOrder = 0,
        definiteEffectNames = [],
    ) {
        propertyWrites.push({
            value,
            position: call.pos,
            sourceFile: call.getSourceFile(),
            node: call,
            receiverOverride: receiver,
            propertyNames,
            effectWrite: true,
            substitutions,
            effectGroup,
            effectOrder,
            definiteEffectNames,
        });
    }

    function definitelyFinalNames(sequence) {
        const names = new Set();
        for (let index = sequence.length - 1; index >= 0; index -= 1) {
            const propertyNames = sequence[index].names;
            if (propertyNames == null) break;
            if (propertyNames.length === 1) names.add(propertyNames[0]);
        }
        return names;
    }

    function substituteStaticExpression(expression, substitutions) {
        expression = unwrapExpression(expression);
        if (!ts.isIdentifier(expression)) return expression;
        const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
        const substituted = substitutions.get(symbol);
        return substituted ? substituteStaticExpression(substituted, substitutions) : expression;
    }

    function callbackSubstitutions(declaration, args) {
        const substitutions = new Map();
        declaration.parameters.forEach((parameter, index) => {
            const argument = args[index];
            if (!argument) return;
            const symbol = unalias(checker, checker.getSymbolAtLocation(parameter.name));
            if (symbol) substitutions.set(symbol, argument);
        });
        return substitutions;
    }

    function callbackReturnOrigins(declaration, args) {
        const substitutions = callbackSubstitutions(declaration, args);
        function expand(expression) {
            expression = substituteStaticExpression(expression, substitutions);
            if (ts.isConditionalExpression(expression)) {
                return boundedCallbackConcat(
                    expand(expression.whenTrue),
                    expand(expression.whenFalse),
                );
            }
            if (
                ts.isBinaryExpression(expression) &&
                [
                    ts.SyntaxKind.BarBarToken,
                    ts.SyntaxKind.AmpersandAmpersandToken,
                    ts.SyntaxKind.QuestionQuestionToken,
                ].includes(expression.operatorToken.kind)
            ) {
                return boundedCallbackConcat(expand(expression.left), expand(expression.right));
            }
            if (
                ts.isBinaryExpression(expression) &&
                expression.operatorToken.kind === ts.SyntaxKind.CommaToken
            ) {
                return expand(expression.right);
            }
            return [expression];
        }
        let origins = [];
        for (const returned of functionReturnExpressions(declaration)) {
            origins = boundedCallbackConcat(origins, expand(returned));
        }
        return origins;
    }

    function staticScalar(expression, substitutions) {
        expression = substituteStaticExpression(expression, substitutions);
        if (expression.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
        if (expression.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
        if (expression.kind === ts.SyntaxKind.NullKeyword) return { known: true, value: null };
        if (ts.isStringLiteralLike(expression)) return { known: true, value: expression.text };
        if (ts.isNumericLiteral(expression)) return { known: true, value: Number(expression.text) };
        if (
            ts.isBinaryExpression(expression) &&
            [
                ts.SyntaxKind.EqualsEqualsToken,
                ts.SyntaxKind.EqualsEqualsEqualsToken,
                ts.SyntaxKind.ExclamationEqualsToken,
                ts.SyntaxKind.ExclamationEqualsEqualsToken,
            ].includes(expression.operatorToken.kind)
        ) {
            const comparable = (operand) => {
                operand = substituteStaticExpression(operand, substitutions);
                if (ts.isIdentifier(operand)) {
                    const symbol = unalias(checker, checker.getSymbolAtLocation(operand));
                    return symbol ? { known: true, value: symbol } : { known: false };
                }
                return staticScalar(operand, substitutions);
            };
            const left = comparable(expression.left);
            const right = comparable(expression.right);
            if (!left.known || !right.known) return { known: false };
            const equal = left.value === right.value;
            const negated = [
                ts.SyntaxKind.ExclamationEqualsToken,
                ts.SyntaxKind.ExclamationEqualsEqualsToken,
            ].includes(expression.operatorToken.kind);
            return { known: true, value: negated ? !equal : equal };
        }
        return { known: false };
    }

    function callbackBooleanResult(declaration, args) {
        const substitutions = callbackSubstitutions(declaration, args);
        function evaluateStatement(statement) {
            if (ts.isReturnStatement(statement)) {
                if (!statement.expression) return { returned: true, value: null };
                const result = staticScalar(statement.expression, substitutions);
                return { returned: true, value: result.known ? Boolean(result.value) : null };
            }
            if (ts.isBlock(statement)) return evaluateStatements(statement.statements);
            if (ts.isIfStatement(statement)) {
                const condition = staticScalar(statement.expression, substitutions);
                if (!condition.known) return { returned: true, value: null };
                const selected = condition.value
                    ? statement.thenStatement
                    : statement.elseStatement;
                return selected ? evaluateStatement(selected) : { returned: false, value: null };
            }
            return { returned: false, value: null };
        }
        function evaluateStatements(statements) {
            for (const statement of statements) {
                const result = evaluateStatement(statement);
                if (result.returned) return result;
            }
            return { returned: false, value: null };
        }
        if (!declaration.body) return null;
        if (!ts.isBlock(declaration.body)) {
            const result = staticScalar(declaration.body, substitutions);
            return result.known ? Boolean(result.value) : null;
        }
        return evaluateStatements(declaration.body.statements).value;
    }

    function boundInvocation(expression, call) {
        if (!ts.isIdentifier(expression)) return null;
        const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
        const initializer = (writesBySymbol.get(symbol) ?? [])
            .filter((write) => write.position < call.pos)
            .at(-1)?.value;
        if (
            !initializer ||
            !ts.isCallExpression(initializer) ||
            !ts.isPropertyAccessExpression(initializer.expression) ||
            initializer.expression.name.text !== "bind"
        ) {
            return null;
        }
        const declaration = functionDeclarationForExpression(initializer.expression.expression);
        return declaration
            ? {
                  declaration,
                  arguments: [...initializer.arguments.slice(1), ...call.arguments],
              }
            : null;
    }

    function invocationAdapter(expression, beforePosition) {
        expression = unwrapExpression(expression);
        if (ts.isPropertyAccessExpression(expression)) {
            return ["call", "apply", "bind"].includes(expression.name.text)
                ? { name: expression.name.text, target: expression.expression }
                : null;
        }
        if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
            const names = reachingPropertyNames(expression.argumentExpression, beforePosition);
            const name = names.length === 1 ? names[0] : null;
            return name && ["call", "apply", "bind"].includes(name)
                ? { name, target: expression.expression }
                : null;
        }
        return null;
    }

    function staticApplyArgumentLists(expression, beforePosition) {
        if (!expression) return [];
        const lists = [];
        for (const value of reachingExpressionValues(expression, beforePosition)) {
            const candidate = unwrapExpression(value.expression);
            if (
                !ts.isArrayLiteralExpression(candidate) ||
                candidate.elements.some(
                    (element) => ts.isSpreadElement(element) || !ts.isExpression(element),
                )
            ) {
                continue;
            }
            lists.push(candidate.elements.filter(ts.isExpression));
        }
        return bounded(lists, "apply argument-list alternatives");
    }

    function normalizeEffectiveCalls(expression, args, beforePosition, seen = new Set()) {
        expression = unwrapExpression(expression);
        const key = `${expression.getSourceFile().fileName}:${expression.pos}:${expression.end}:${args.length}`;
        if (seen.has(key)) return [];
        const nextSeen = new Set(seen);
        nextSeen.add(key);

        let candidates = [{ expression, substitutions: new Map() }];
        if (ts.isIdentifier(expression)) {
            const boundCandidates = reachingExpressionValues(expression, beforePosition).filter(
                (value) => {
                    const candidate = unwrapExpression(value.expression);
                    return (
                        ts.isCallExpression(candidate) &&
                        invocationAdapter(candidate.expression, candidate.pos)?.name === "bind"
                    );
                },
            );
            if (boundCandidates.length > 0) candidates = bounded(boundCandidates);
        }
        const normalized = [];
        for (const candidate of candidates) {
            const callee = unwrapExpression(candidate.expression);
            if (ts.isCallExpression(callee)) {
                const bound = invocationAdapter(callee.expression, callee.pos);
                if (bound?.name === "bind") {
                    normalized.push(
                        ...normalizeEffectiveCalls(
                            bound.target,
                            [...callee.arguments.slice(1), ...args],
                            callee.pos,
                            nextSeen,
                        ),
                    );
                    continue;
                }
            }

            const adapter = invocationAdapter(callee, beforePosition);
            if (adapter?.name === "bind") continue;
            if (adapter?.name === "call") {
                normalized.push(
                    ...normalizeEffectiveCalls(
                        adapter.target,
                        args.slice(1),
                        beforePosition,
                        nextSeen,
                    ),
                );
                continue;
            }
            if (adapter?.name === "apply") {
                for (const applied of staticApplyArgumentLists(args[1], beforePosition)) {
                    normalized.push(
                        ...normalizeEffectiveCalls(
                            adapter.target,
                            applied,
                            beforePosition,
                            nextSeen,
                        ),
                    );
                }
                continue;
            }
            normalized.push({ expression: callee, arguments: [...args] });
        }
        return bounded(normalized, "effective call alternatives");
    }

    for (const sourceFile of program.getSourceFiles()) {
        if (analysisExhausted) break;
        if (sourceFile.isDeclarationFile) continue;
        function indexCallArguments(node) {
            if (analysisExhausted) return;
            if (ts.isCallExpression(node)) {
                const declaration = checker.getResolvedSignature(node)?.declaration;
                const skipped = expressionDefinitelySkipped(node);
                if (!skipped) addInvocation(declaration, node, node.arguments);

                if (!skipped && ts.isPropertyAccessExpression(node.expression)) {
                    const invocation = node.expression.name.text;
                    const target = node.expression.expression;
                    if (["call", "apply"].includes(invocation)) {
                        const targetDeclaration = functionDeclarationForExpression(target);
                        const args =
                            invocation === "call"
                                ? node.arguments.slice(1)
                                : ts.isArrayLiteralExpression(node.arguments[1])
                                  ? node.arguments[1].elements.filter(ts.isExpression)
                                  : [];
                        addInvocation(targetDeclaration, node, args);
                    }

                    const synchronousArrayMethods = new Set([
                        "forEach",
                        "map",
                        "filter",
                        "every",
                        "some",
                        "find",
                        "findIndex",
                        "flatMap",
                        "reduce",
                        "reduceRight",
                    ]);
                    if (synchronousArrayMethods.has(invocation) && node.arguments[0]) {
                        const callback = functionDeclarationForExpression(node.arguments[0]);
                        const receivers = reachingExpressionValues(
                            node.expression.expression,
                            node.pos,
                        )
                            .map((value) => unwrapExpression(value.expression))
                            .filter(ts.isArrayLiteralExpression);
                        for (const receiver of receivers) {
                            if (!callback) continue;
                            const values = receiver.elements.filter(ts.isExpression);
                            if (["reduce", "reduceRight"].includes(invocation)) {
                                const ordered =
                                    invocation === "reduceRight" ? [...values].reverse() : values;
                                const initial = node.arguments[1] ?? ordered.shift();
                                let accumulators = initial ? [initial] : [];
                                for (const value of ordered) {
                                    const next = [];
                                    for (const accumulator of accumulators) {
                                        const args = [accumulator, value];
                                        addSyntheticInvocation(callback, node, args);
                                        next.push(...callbackReturnOrigins(callback, args));
                                    }
                                    accumulators = bounded(next);
                                    if (accumulators.length === 0) break;
                                }
                            } else {
                                for (const value of values) {
                                    const args = [value];
                                    addSyntheticInvocation(callback, node, args);
                                    const result = callbackBooleanResult(callback, args);
                                    if (
                                        (["some", "find", "findIndex"].includes(invocation) &&
                                            result === true) ||
                                        (invocation === "every" && result === false)
                                    ) {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                const effectiveCalls = skipped
                    ? []
                    : normalizeEffectiveCalls(node.expression, node.arguments, node.pos);
                effectiveCalls.forEach((effectiveCall, normalizedPathIndex) => {
                    const effectiveExpression = effectiveCall.expression;
                    const effectiveArguments = effectiveCall.arguments;
                    const normalizedCallIsDefinite = effectiveCalls.length === 1;

                    if (
                        effectiveArguments[0] &&
                        expressionResolvesToBuiltinMember(
                            effectiveExpression,
                            "Object",
                            "assign",
                            node.pos,
                        )
                    ) {
                        let sequences = [[]];
                        for (const source of effectiveArguments.slice(1)) {
                            const alternatives = objectPropertySequences(source, node.pos);
                            if (alternatives.length > 0) {
                                sequences = bounded(
                                    sequences.flatMap((sequence) =>
                                        alternatives.map((alternative) => [
                                            ...sequence,
                                            ...alternative,
                                        ]),
                                    ),
                                );
                            } else {
                                sequences = sequences.map((sequence) => [
                                    ...sequence,
                                    { value: source, names: null, substitutions: new Map() },
                                ]);
                            }
                        }
                        const finalNameSets = sequences.map(definitelyFinalNames);
                        const definiteEffectNames = [...(finalNameSets[0] ?? new Set())].filter(
                            (name) => finalNameSets.every((names) => names.has(name)),
                        );
                        sequences.forEach((sequence, pathIndex) => {
                            const effectGroup = `${node.getSourceFile().fileName}:${node.pos}:assign:${normalizedPathIndex}:${pathIndex}`;
                            sequence.forEach((property, effectOrder) => {
                                addEffectWrite(
                                    effectiveArguments[0],
                                    property.value,
                                    property.names,
                                    node,
                                    property.substitutions,
                                    effectGroup,
                                    effectOrder,
                                    normalizedCallIsDefinite ? definiteEffectNames : [],
                                );
                            });
                        });
                    }

                    if (
                        effectiveArguments.length >= 3 &&
                        expressionResolvesToBuiltinMember(
                            effectiveExpression,
                            "Reflect",
                            "set",
                            node.pos,
                        )
                    ) {
                        const key = effectiveArguments[1];
                        const names =
                            ts.isStringLiteralLike(key) || ts.isNumericLiteral(key)
                                ? [key.text]
                                : literalPropertyNames(checker.getTypeAtLocation(key));
                        addEffectWrite(
                            effectiveArguments[0],
                            effectiveArguments[2],
                            names,
                            node,
                            new Map(),
                            `${node.getSourceFile().fileName}:${node.pos}:reflect-set:${normalizedPathIndex}`,
                            0,
                            normalizedCallIsDefinite && names?.length === 1 ? names : [],
                        );
                    }

                    if (
                        effectiveArguments.length >= 3 &&
                        (expressionResolvesToBuiltinMember(
                            effectiveExpression,
                            "Object",
                            "defineProperty",
                            node.pos,
                        ) ||
                            expressionResolvesToBuiltinMember(
                                effectiveExpression,
                                "Reflect",
                                "defineProperty",
                                node.pos,
                            ))
                    ) {
                        const key = effectiveArguments[1];
                        const names =
                            ts.isStringLiteralLike(key) || ts.isNumericLiteral(key)
                                ? [key.text]
                                : literalPropertyNames(checker.getTypeAtLocation(key));
                        const paths = descriptorEffectSequences(effectiveArguments[2], node.pos);
                        paths.forEach((path, pathIndex) => {
                            const effectGroup = `${node.getSourceFile().fileName}:${node.pos}:define-property:${normalizedPathIndex}:${pathIndex}`;
                            path.forEach((value, effectOrder) =>
                                addEffectWrite(
                                    effectiveArguments[0],
                                    value.value,
                                    names,
                                    node,
                                    value.substitutions,
                                    effectGroup,
                                    effectOrder,
                                    normalizedCallIsDefinite &&
                                        names?.length === 1 &&
                                        path.length > 0
                                        ? names
                                        : [],
                                ),
                            );
                        });
                    }

                    if (
                        effectiveArguments.length >= 2 &&
                        expressionResolvesToBuiltinMember(
                            effectiveExpression,
                            "Object",
                            "defineProperties",
                            node.pos,
                        )
                    ) {
                        const paths = definePropertiesEffectPaths(effectiveArguments[1], node.pos);
                        const finalNameSets = paths.map(definitelyFinalNames);
                        const definiteEffectNames = [...(finalNameSets[0] ?? new Set())].filter(
                            (name) => finalNameSets.every((names) => names.has(name)),
                        );
                        paths.forEach((path, pathIndex) => {
                            const effectGroup = `${node.getSourceFile().fileName}:${node.pos}:define-properties:${normalizedPathIndex}:${pathIndex}`;
                            path.forEach((value, effectOrder) =>
                                addEffectWrite(
                                    effectiveArguments[0],
                                    value.value,
                                    value.names,
                                    node,
                                    value.substitutions,
                                    effectGroup,
                                    effectOrder,
                                    normalizedCallIsDefinite ? definiteEffectNames : [],
                                ),
                            );
                        });
                    }
                });

                const bound = boundInvocation(node.expression, node);
                if (!skipped && bound) addInvocation(bound.declaration, node, bound.arguments);
            }
            ts.forEachChild(node, indexCallArguments);
        }
        indexCallArguments(sourceFile);
    }

    function addFinding(node, packageName, kind, assertedType, expectedRequestType) {
        const sourceFile = node.getSourceFile();
        const file = sourceRelative(root, sourceFile);
        const line = nodeLine(sourceFile, node);
        const key = `${file}:${node.pos}:${kind}:${expectedRequestType}`;
        if (findingKeys.has(key)) return;
        findingKeys.add(key);
        findings.push({
            file,
            line,
            kind,
            assertedType,
            expectedRequestType,
            generatedRequestType: expectedRequestType,
            packageName,
        });
    }

    function typeMayCarryRequest(type, expectedRequestType) {
        return (
            (type.flags & ts.TypeFlags.Any) !== 0 ||
            requestNameFromType(checker, type) === expectedRequestType ||
            typeContainsTypeParameter(checker, type)
        );
    }

    function directStatementInLinearContainer(node) {
        let current = node;
        while (current.parent) {
            if (ts.isBlock(current.parent) || ts.isSourceFile(current.parent)) {
                return ts.isStatement(current)
                    ? { statement: current, container: current.parent }
                    : null;
            }
            current = current.parent;
        }
        return null;
    }

    function expressionDefinitelyExecutesInStatement(node) {
        let current = node;
        while (current.parent && !ts.isExpressionStatement(current)) {
            const parent = current.parent;
            if (ts.isBinaryExpression(parent) && current === parent.right) {
                const state = staticScalar(parent.left, new Map());
                if (
                    (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
                        (!state.known || !state.value)) ||
                    (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
                        (!state.known || Boolean(state.value))) ||
                    (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
                        (!state.known || state.value != null))
                ) {
                    return false;
                }
            }
            if (ts.isConditionalExpression(parent)) {
                const state = staticScalar(parent.condition, new Map());
                if (
                    !state.known ||
                    (current === parent.whenTrue && !state.value) ||
                    (current === parent.whenFalse && Boolean(state.value))
                ) {
                    return false;
                }
            }
            current = parent;
        }
        return ts.isExpressionStatement(current);
    }

    function statementDefinitelyWritesSymbol(statement, symbol, use) {
        if (ts.isBlock(statement)) {
            return statement.statements.some((child) =>
                statementDefinitelyWritesSymbol(child, symbol, use),
            );
        }
        if (ts.isVariableStatement(statement)) {
            return statement.declarationList.declarations.some(
                (declaration) =>
                    declaration.initializer != null &&
                    ts.isIdentifier(declaration.name) &&
                    symbolForWriteTarget(declaration.name) === symbol,
            );
        }
        if (ts.isExpressionStatement(statement)) {
            const expression = statement.expression;
            if (
                !ts.isBinaryExpression(expression) ||
                expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
                !symbolsForWriteTarget(expression.left).includes(symbol)
            ) {
                return false;
            }
            return writeMayReachExpression(
                { node: expression.left, position: expression.pos },
                use,
            );
        }
        if (ts.isIfStatement(statement)) {
            return (
                statement.elseStatement != null &&
                statementDefinitelyWritesSymbol(statement.thenStatement, symbol, use) &&
                statementDefinitelyWritesSymbol(statement.elseStatement, symbol, use)
            );
        }
        if (ts.isLabeledStatement(statement)) {
            return statementDefinitelyWritesSymbol(statement.statement, symbol, use);
        }
        return false;
    }

    function latestDefiniteWriteCutoff(symbol, use) {
        const useLocation = directStatementInLinearContainer(use);
        if (!useLocation) return null;
        let cutoff = null;
        for (const statement of useLocation.container.statements) {
            if (statement === useLocation.statement) break;
            if (statementDefinitelyWritesSymbol(statement, symbol, use)) cutoff = statement.pos;
        }
        return cutoff;
    }

    function enclosingFunction(node) {
        for (let current = node.parent; current; current = current.parent) {
            if (ts.isFunctionLike(current)) return current;
        }
        return null;
    }

    function activeCallsOf(declaration, use, depth = 0, seen = new Set()) {
        if (depth > MAX_TRACE_DEPTH || seen.has(declaration)) return [];
        const nextSeen = new Set(seen);
        nextSeen.add(declaration);
        const useFunction = enclosingFunction(use);
        const active = [];
        for (const invocation of callsByDeclaration.get(declaration) ?? []) {
            const call = invocation.node;
            const caller = enclosingFunction(call);
            if (
                caller === useFunction &&
                call.getSourceFile() === use.getSourceFile() &&
                call.pos < use.pos
            ) {
                active.push(invocation);
                continue;
            }
            if (caller && activeCallsOf(caller, use, depth + 1, nextSeen).length > 0) {
                active.push(invocation);
            }
        }
        return active;
    }

    function parameterSubstitutions(declaration, invocation) {
        const substitutions = new Map();
        declaration.parameters.forEach((parameter, index) => {
            const argument = invocation.arguments[index];
            if (!argument) return;
            const symbol = unalias(checker, checker.getSymbolAtLocation(parameter.name));
            if (symbol) substitutions.set(symbol, argument);
        });
        return substitutions;
    }

    function substituteReceiver(expression, substitutions) {
        while (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression) ||
            ts.isSatisfiesExpression(expression)
        ) {
            expression = expression.expression;
        }
        if (ts.isIdentifier(expression)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
            return substitutions.get(symbol) ?? expression;
        }
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
            return substituteReceiver(expression.expression, substitutions);
        }
        return expression;
    }

    function effectiveWrites(write, use) {
        const declaration = enclosingFunction(write.node);
        if (!declaration || declaration === enclosingFunction(use)) return [write];
        const useFunction = enclosingFunction(use);
        function lift(effect, owner, invocation, depth = 0) {
            if (depth > MAX_TRACE_DEPTH) return [];
            const call = invocation.node;
            const substitutions = parameterSubstitutions(owner, invocation);
            const originalReceiver =
                effect.receiverOverride ??
                (ts.isPropertyAccessExpression(write.node) ||
                ts.isElementAccessExpression(write.node)
                    ? write.node.expression
                    : null);
            const receiver = originalReceiver
                ? substituteReceiver(originalReceiver, substitutions)
                : null;
            const lifted = {
                ...effect,
                position: call.pos,
                sourceFile: call.getSourceFile(),
                receiverOverride: receiver,
                substitutions: new Map([...(effect.substitutions ?? []), ...substitutions]),
            };
            const caller = enclosingFunction(call);
            if (!caller || caller === useFunction) return [lifted];
            return activeCallsOf(caller, use).flatMap((callerInvocation) =>
                lift(lifted, caller, callerInvocation, depth + 1),
            );
        }
        return bounded(
            activeCallsOf(declaration, use).flatMap((invocation) =>
                lift(write, declaration, invocation),
            ),
        );
    }

    function receiverOrigins(
        expression,
        beforePosition,
        seen = new Set(),
        substitutions = new Map(),
    ) {
        if (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isSatisfiesExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression)
        ) {
            return receiverOrigins(expression.expression, beforePosition, seen, substitutions);
        }
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
            return receiverOrigins(expression.expression, beforePosition, seen, substitutions);
        }
        if (ts.isConditionalExpression(expression)) {
            return new Set([
                ...receiverOrigins(expression.whenTrue, beforePosition, seen, substitutions),
                ...receiverOrigins(expression.whenFalse, beforePosition, seen, substitutions),
            ]);
        }
        if (ts.isBinaryExpression(expression)) {
            if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
                return receiverOrigins(expression.right, beforePosition, seen, substitutions);
            }
            if (
                expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
            ) {
                return new Set([
                    ...receiverOrigins(expression.left, beforePosition, seen, substitutions),
                    ...receiverOrigins(expression.right, beforePosition, seen, substitutions),
                ]);
            }
        }
        if (ts.isCallExpression(expression)) {
            const declaration = checker.getResolvedSignature(expression)?.declaration;
            if (declaration && ts.isFunctionLike(declaration) && declaration.body) {
                const callKey = `${expression.getSourceFile().fileName}:${expression.pos}:${expression.end}:receiver-call`;
                if (seen.has(callKey)) return new Set();
                const nextSeen = new Set(seen);
                nextSeen.add(callKey);
                const nested = new Map(substitutions);
                declaration.parameters.forEach((parameter, index) => {
                    const argument = expression.arguments[index];
                    if (!argument || !ts.isIdentifier(parameter.name)) return;
                    const symbol = unalias(checker, checker.getSymbolAtLocation(parameter.name));
                    if (symbol) nested.set(symbol, argument);
                });
                return new Set(
                    functionReturnExpressions(declaration).flatMap((returned) => [
                        ...receiverOrigins(returned, beforePosition, nextSeen, nested),
                    ]),
                );
            }
            return new Set(
                expression.arguments.flatMap((argument) => [
                    ...receiverOrigins(argument, beforePosition, seen, substitutions),
                ]),
            );
        }
        if (!ts.isIdentifier(expression)) return new Set();
        const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
        const substitution = substitutions.get(symbol);
        if (substitution) {
            return receiverOrigins(substitution, beforePosition, seen, substitutions);
        }
        if (!symbol || seen.has(symbol)) return new Set();
        const nextSeen = new Set(seen);
        nextSeen.add(symbol);
        const origins = new Set();
        const cutoff = latestDefiniteWriteCutoff(symbol, expression);
        for (const write of writesBySymbol.get(symbol) ?? []) {
            if (write.position >= beforePosition) continue;
            if (cutoff != null && write.position < cutoff) continue;
            for (const origin of receiverOrigins(
                write.value,
                write.position,
                nextSeen,
                substitutions,
            )) {
                origins.add(origin);
            }
        }
        if (origins.size === 0) origins.add(symbol);
        return origins;
    }

    function writeMayReachExpression(write, expression) {
        if (
            !(
                write.receiverOverride ||
                ts.isPropertyAccessExpression(write.node) ||
                ts.isElementAccessExpression(write.node)
            ) ||
            !(ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression))
        ) {
            return true;
        }
        const writeOrigins = receiverOrigins(
            write.receiverOverride ?? write.node.expression,
            write.position,
        );
        const useOrigins = receiverOrigins(expression.expression, expression.pos);
        if (writeOrigins.size === 0 || useOrigins.size === 0) return true;
        return [...writeOrigins].some((origin) => useOrigins.has(origin));
    }

    function applyOrderedEffectCutoffs(writes, usePropertyNames) {
        if (usePropertyNames?.length !== 1) return writes;
        const useName = usePropertyNames[0];
        const cutoffs = new Map();
        for (const write of writes) {
            if (
                write.effectGroup &&
                write.propertyNames?.length === 1 &&
                write.propertyNames[0] === useName
            ) {
                cutoffs.set(
                    write.effectGroup,
                    Math.max(cutoffs.get(write.effectGroup) ?? -1, write.effectOrder ?? 0),
                );
            }
        }
        return writes.filter(
            (write) =>
                !write.effectGroup ||
                (write.effectOrder ?? 0) >= (cutoffs.get(write.effectGroup) ?? -1),
        );
    }

    function applyCrossStatementEffectCutoff(writes, expression, usePropertyNames) {
        if (usePropertyNames?.length !== 1) return writes;
        const useLocation = directStatementInLinearContainer(expression);
        if (!useLocation) return writes;
        const useName = usePropertyNames[0];
        let cutoff = null;
        for (const write of writes) {
            if (!write.definiteEffectNames?.includes(useName)) continue;
            const location = directStatementInLinearContainer(write.node);
            if (
                !location ||
                location.container !== useLocation.container ||
                !ts.isExpressionStatement(location.statement) ||
                !expressionDefinitelyExecutesInStatement(write.node)
            ) {
                continue;
            }
            cutoff = Math.max(cutoff ?? -1, write.position);
        }
        return cutoff == null ? writes : writes.filter((write) => write.position >= cutoff);
    }

    function reachingWrites(symbol, expression) {
        const usePropertyNames = ts.isPropertyAccessExpression(expression)
            ? [expression.name.text]
            : ts.isElementAccessExpression(expression)
              ? computedPropertyNames(expression)
              : null;
        const matchingPropertyWrites =
            ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
                ? [...propertyWrites, ...wildcardPropertyWrites].filter(
                      (write) =>
                          write.propertyNames == null ||
                          usePropertyNames == null ||
                          write.propertyNames.some((name) => usePropertyNames.includes(name)),
                  )
                : [];
        const writes = applyCrossStatementEffectCutoff(
            applyOrderedEffectCutoffs(
                [...(writesBySymbol.get(symbol) ?? []), ...matchingPropertyWrites]
                    .flatMap((write) => effectiveWrites(write, expression))
                    .filter(
                        (write) =>
                            write.sourceFile === expression.getSourceFile() &&
                            write.position < expression.pos &&
                            writeMayReachExpression(write, expression),
                    )
                    .sort((left, right) => left.position - right.position)
                    .filter((write, index, all) => index === 0 || write !== all[index - 1]),
                usePropertyNames,
            ),
            expression,
            usePropertyNames,
        );
        const cutoff = latestDefiniteWriteCutoff(symbol, expression);
        return {
            hasDominator: cutoff != null,
            writes: cutoff == null ? writes : writes.filter((write) => write.position >= cutoff),
        };
    }

    function projectedExpressions(source, steps, depth = 0, seen = new Set()) {
        if (!source || depth > MAX_TRACE_DEPTH) return [];
        if (steps.length === 0) return [source];
        while (
            ts.isParenthesizedExpression(source) ||
            ts.isAsExpression(source) ||
            ts.isTypeAssertionExpression(source) ||
            ts.isSatisfiesExpression(source)
        ) {
            source = source.expression;
        }
        const key = `${source.getSourceFile().fileName}:${source.pos}:${source.end}:${JSON.stringify(steps)}`;
        if (seen.has(key)) return [];
        const nextSeen = new Set(seen);
        nextSeen.add(key);
        if (ts.isIdentifier(source)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(source));
            const values = reachingWrites(symbol, source).writes.map((write) => write.value);
            if (values.length === 0) {
                for (const declaration of symbol?.declarations ?? []) {
                    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
                        values.push(declaration.initializer);
                    }
                }
            }
            if (values.length > 0) {
                return values.flatMap((value) =>
                    projectedExpressions(value, steps, depth + 1, nextSeen),
                );
            }
        }
        const [step, ...rest] = steps;
        if (step.kind === "property" && ts.isObjectLiteralExpression(source)) {
            const selected = literalObjectProperty(source, step.names);
            return selected ? projectedExpressions(selected, rest, depth + 1, nextSeen) : [];
        }
        if (step.kind === "array" && ts.isArrayLiteralExpression(source)) {
            const selected = source.elements[step.index];
            return selected && !ts.isOmittedExpression(selected)
                ? projectedExpressions(selected, rest, depth + 1, nextSeen)
                : [];
        }
        if (step.kind === "objectRest") {
            const access = rest[0];
            if (access?.kind === "property" && access.names.length === 1) {
                if (step.excluded.includes(access.names[0])) return [];
                return projectedExpressions(
                    source,
                    [access, ...rest.slice(1)],
                    depth + 1,
                    nextSeen,
                );
            }
        }
        if (step.kind === "arrayRest") {
            const access = rest[0];
            if (access?.kind === "array") {
                return projectedExpressions(
                    source,
                    [{ kind: "array", index: step.start + access.index }, ...rest.slice(1)],
                    depth + 1,
                    nextSeen,
                );
            }
        }
        return [source];
    }

    function traceWrites(symbol, expression, context, depth, seen) {
        const reaching = reachingWrites(symbol, expression);
        for (const write of reaching.writes) {
            if (
                write.declaredType &&
                context.atBoundaryValue &&
                (checker.getTypeFromTypeNode(write.declaredType).flags & ts.TypeFlags.Any) !== 0
            ) {
                addFinding(
                    write.declaredType,
                    context.packageName,
                    "annotated any request value",
                    write.declaredType.getText(),
                    context.expectedRequestType,
                );
            }
            const substitutions = new Map(context.substitutions);
            for (const [parameter, argument] of write.substitutions ?? []) {
                substitutions.set(parameter, argument);
            }
            const accessPath = context.accessPath ?? [];
            const projection = [...(write.projection ?? []), ...accessPath];
            const values = projectedExpressions(write.value, projection);
            const defaultReachable =
                write.defaultValue &&
                (values.length === 0 ||
                    values.some(
                        (value) =>
                            (ts.isIdentifier(value) && value.text === "undefined") ||
                            ts.isVoidExpression(value),
                    ));
            for (const value of values) {
                trace(value, { ...context, substitutions, accessPath: [] }, depth + 1, seen);
            }
            if (defaultReachable) {
                trace(
                    write.defaultValue,
                    { ...context, substitutions, accessPath: [] },
                    depth + 1,
                    seen,
                );
            }
        }
        return reaching;
    }

    function traceBindingElement(binding, context, depth, seen) {
        const steps = [];
        let current = binding;
        let declaration = null;
        while (ts.isBindingElement(current)) {
            const pattern = current.parent;
            if (!ts.isObjectBindingPattern(pattern) && !ts.isArrayBindingPattern(pattern)) return;
            let key;
            if (ts.isObjectBindingPattern(pattern)) {
                const property = current.propertyName ?? current.name;
                if (ts.isComputedPropertyName(property)) {
                    key = literalPropertyNames(checker.getTypeAtLocation(property.expression))?.[0];
                } else {
                    key = property.getText(current.getSourceFile()).replace(/^['"]|['"]$/g, "");
                }
            } else {
                key = pattern.elements.indexOf(current);
            }
            steps.push({
                binding: current,
                key,
            });
            if (ts.isVariableDeclaration(pattern.parent)) {
                declaration = pattern.parent;
                break;
            }
            if (ts.isParameter(pattern.parent)) {
                declaration = pattern.parent;
                break;
            }
            current = pattern.parent;
        }
        if (!declaration) return;
        steps.reverse();

        function literalSelection(source, key) {
            if (ts.isObjectLiteralExpression(source) && typeof key === "string") {
                for (const property of source.properties) {
                    const name = property.name
                        ?.getText(source.getSourceFile())
                        .replace(/^['"]|['"]$/g, "");
                    if (name !== key) continue;
                    if (ts.isPropertyAssignment(property)) {
                        return { known: true, value: property.initializer };
                    }
                    if (ts.isShorthandPropertyAssignment(property)) {
                        return { known: true, value: property.name };
                    }
                }
                return { known: true, value: null };
            }
            if (ts.isArrayLiteralExpression(source) && typeof key === "number") {
                const element = source.elements[key];
                return {
                    known: true,
                    value: element && !ts.isOmittedExpression(element) ? element : null,
                };
            }
            return { known: false, value: null };
        }

        function isDefinitelyUndefined(value) {
            if (!value) return true;
            if (ts.isIdentifier(value) && value.text === "undefined") return true;
            if (ts.isVoidExpression(value)) return true;
            if (
                ts.isParenthesizedExpression(value) ||
                ts.isAsExpression(value) ||
                ts.isTypeAssertionExpression(value)
            ) {
                return isDefinitelyUndefined(value.expression);
            }
            return false;
        }

        function traceStep(source, stepIndex, propertyDepth, propertySeen) {
            if (propertyDepth > MAX_TRACE_DEPTH) return;
            if (stepIndex >= steps.length) {
                trace(source, context, propertyDepth + 1, propertySeen);
                return;
            }
            if (ts.isParenthesizedExpression(source)) {
                traceStep(source.expression, stepIndex, propertyDepth + 1, propertySeen);
                return;
            }
            if (ts.isIdentifier(source)) {
                const symbol = unalias(checker, checker.getSymbolAtLocation(source));
                const writes = reachingWrites(symbol, source).writes;
                if (writes.length > 0) {
                    for (const write of writes) {
                        traceStep(write.value, stepIndex, propertyDepth + 1, propertySeen);
                    }
                    return;
                }
            }
            const step = steps[stepIndex];
            const selected = literalSelection(source, step.key);
            if (selected.known && !isDefinitelyUndefined(selected.value)) {
                traceStep(selected.value, stepIndex + 1, propertyDepth + 1, propertySeen);
                return;
            }
            if (step.binding.initializer) {
                traceStep(step.binding.initializer, stepIndex + 1, propertyDepth + 1, propertySeen);
            }
            if (!selected.known) {
                trace(source, context, propertyDepth + 1, propertySeen);
            }
        }

        if (ts.isVariableDeclaration(declaration)) {
            if (declaration.initializer) {
                traceStep(declaration.initializer, 0, depth + 1, seen);
            }
            return;
        }
        const owner = declaration.parent;
        const parameterIndex = owner.parameters.indexOf(declaration);
        const invocations = callsByDeclaration.get(owner) ?? [];
        const externallyCallable = isExternallyCallable(owner);
        let tracedSource = false;
        for (const invocation of invocations) {
            const argument = invocation.arguments[parameterIndex];
            if (argument) {
                traceStep(argument, 0, depth + 1, seen);
                tracedSource = true;
            } else if (declaration.initializer) {
                traceStep(declaration.initializer, 0, depth + 1, seen);
                tracedSource = true;
            }
        }
        if ((!tracedSource || externallyCallable) && declaration.initializer) {
            traceStep(declaration.initializer, 0, depth + 1, seen);
        }
    }

    function callableEscapes(declaration) {
        const name = ts.isFunctionDeclaration(declaration)
            ? declaration.name
            : (ts.isArrowFunction(declaration) || ts.isFunctionExpression(declaration)) &&
                ts.isVariableDeclaration(declaration.parent) &&
                ts.isIdentifier(declaration.parent.name)
              ? declaration.parent.name
              : null;
        if (!name) return false;
        const symbol = unalias(checker, checker.getSymbolAtLocation(name));
        let escaped = false;
        function visit(node) {
            if (escaped) return;
            if (
                ts.isIdentifier(node) &&
                node !== name &&
                unalias(
                    checker,
                    ts.isShorthandPropertyAssignment(node.parent)
                        ? checker.getShorthandAssignmentValueSymbol(node.parent)
                        : checker.getSymbolAtLocation(node),
                ) === symbol
            ) {
                if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
                    return;
                }
                escaped = true;
                return;
            }
            ts.forEachChild(node, visit);
        }
        visit(declaration.getSourceFile());
        return escaped;
    }

    function isExternallyCallable(declaration) {
        if (
            ts.canHaveModifiers(declaration) &&
            (ts.getModifiers(declaration) ?? []).some(
                (modifier) =>
                    modifier.kind === ts.SyntaxKind.ExportKeyword ||
                    modifier.kind === ts.SyntaxKind.DefaultKeyword,
            )
        ) {
            return true;
        }
        if (
            (ts.isArrowFunction(declaration) || ts.isFunctionExpression(declaration)) &&
            ts.isVariableDeclaration(declaration.parent)
        ) {
            const statement = declaration.parent.parent.parent;
            if (
                ts.isVariableStatement(statement) &&
                (ts.getModifiers(statement) ?? []).some(
                    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
                )
            ) {
                return true;
            }
        }
        return callableEscapes(declaration);
    }

    function trace(expression, context, depth = 0, seen = new Set()) {
        if (!expression || depth > MAX_TRACE_DEPTH) return;
        const traceKey = `${expression.getSourceFile().fileName}:${expression.pos}:${expression.end}`;
        if (seen.has(traceKey)) return;
        const nextSeen = new Set(seen);
        nextSeen.add(traceKey);

        if (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isSatisfiesExpression(expression) ||
            ts.isAwaitExpression(expression)
        ) {
            trace(expression.expression, context, depth + 1, nextSeen);
            return;
        }
        if (ts.isSpreadElement(expression)) {
            trace(expression.expression, context, depth + 1, nextSeen);
            return;
        }
        if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
            const asserted = checker.getTypeFromTypeNode(expression.type);
            const assertedText = expression.type.getText(expression.getSourceFile());
            const generated =
                requestNameFromTypeNode(checker, expression.type) ??
                requestNameFromType(checker, asserted);
            if ((asserted.flags & ts.TypeFlags.Any) !== 0) {
                addFinding(
                    expression,
                    context.packageName,
                    "request assertion",
                    assertedText,
                    context.expectedRequestType,
                );
            } else if ((asserted.flags & ts.TypeFlags.Never) !== 0) {
                addFinding(
                    expression,
                    context.packageName,
                    "request assertion",
                    "never",
                    context.expectedRequestType,
                );
            } else if (generated) {
                addFinding(
                    expression,
                    context.packageName,
                    "generated request assertion",
                    assertedText,
                    context.expectedRequestType,
                );
            } else if (context.atBoundaryValue && typeContainsTypeParameter(checker, asserted)) {
                addFinding(
                    expression,
                    context.packageName,
                    "generic request helper",
                    assertedText,
                    context.expectedRequestType,
                );
            } else if (context.atBoundaryValue) {
                addFinding(
                    expression,
                    context.packageName,
                    "structural request assertion",
                    assertedText,
                    context.expectedRequestType,
                );
            }
            trace(expression.expression, context, depth + 1, nextSeen);
            return;
        }
        if (ts.isIdentifier(expression)) {
            const original = checker.getSymbolAtLocation(expression);
            const symbol = unalias(checker, original);
            for (const declaration of symbol?.declarations ?? []) {
                if (ts.isParameter(declaration) && context.atBoundaryValue) {
                    const parameterType = checker.getTypeAtLocation(declaration);
                    if ((parameterType.flags & ts.TypeFlags.Any) !== 0) {
                        addFinding(
                            declaration.type ?? declaration,
                            context.packageName,
                            `any request helper ${functionDisplayName(declaration.parent)}`,
                            declaration.type?.getText() ?? "any",
                            context.expectedRequestType,
                        );
                    }
                    if (declaration.initializer) {
                        const owner = declaration.parent;
                        const parameterIndex = owner.parameters.indexOf(declaration);
                        const calls = callsByDeclaration.get(owner) ?? [];
                        const defaultMayRun =
                            isExternallyCallable(owner) ||
                            calls.length === 0 ||
                            calls.some((call) => {
                                const argument = call.arguments[parameterIndex];
                                return (
                                    !argument ||
                                    (ts.isIdentifier(argument) && argument.text === "undefined") ||
                                    ts.isVoidExpression(argument)
                                );
                            });
                        if (defaultMayRun) {
                            trace(declaration.initializer, context, depth + 1, nextSeen);
                        }
                    }
                }
                if (ts.isBindingElement(declaration)) {
                    traceBindingElement(declaration, context, depth, nextSeen);
                }
            }
            const substitution =
                context.substitutions.get(original) ?? context.substitutions.get(symbol);
            if (substitution) {
                trace(substitution, context, depth + 1, nextSeen);
                return;
            }
            const reaching = traceWrites(symbol, expression, context, depth, nextSeen);
            if (reaching.writes.length > 0) {
                return;
            }
            for (const declaration of symbol?.declarations ?? []) {
                if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
                    trace(declaration.initializer, context, depth + 1, nextSeen);
                }
            }
            return;
        }
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
            const symbol = unalias(
                checker,
                checker.getSymbolAtLocation(expression.name ?? expression.argumentExpression),
            );
            const reaching = traceWrites(symbol, expression, context, depth, nextSeen);
            if (reaching.writes.length > 0 && reaching.hasDominator) return;
            for (const declaration of symbol?.declarations ?? []) {
                if (ts.isPropertyAssignment(declaration)) {
                    trace(declaration.initializer, context, depth + 1, nextSeen);
                } else if (ts.isGetAccessorDeclaration(declaration)) {
                    for (const returned of functionReturnExpressions(declaration)) {
                        trace(returned, context, depth + 1, nextSeen);
                    }
                } else if (
                    ts.isPropertyDeclaration(declaration) &&
                    declaration.type &&
                    context.atBoundaryValue &&
                    (checker.getTypeFromTypeNode(declaration.type).flags & ts.TypeFlags.Any) !== 0
                ) {
                    addFinding(
                        declaration.type,
                        context.packageName,
                        "annotated any request property",
                        declaration.type.getText(),
                        context.expectedRequestType,
                    );
                }
            }
            if (ts.isIdentifier(expression.expression)) {
                const receiverSymbol = unalias(
                    checker,
                    checker.getSymbolAtLocation(expression.expression),
                );
                const receiverWrites = writesBySymbol.get(receiverSymbol) ?? [];
                const accessNames = ts.isPropertyAccessExpression(expression)
                    ? [{ kind: "property", names: [expression.name.text] }]
                    : (computedPropertyNames(expression)?.map((name) => ({
                          kind: /^\d+$/.test(name) ? "array" : "property",
                          ...(/^\d+$/.test(name) ? { index: Number(name) } : { names: [name] }),
                      })) ?? []);
                if (
                    (receiverSymbol?.declarations ?? []).some(
                        (declaration) =>
                            ts.isParameter(declaration) || ts.isBindingElement(declaration),
                    ) ||
                    receiverWrites.some((write) => (write.projection?.length ?? 0) > 0)
                ) {
                    for (const access of accessNames.length > 0 ? accessNames : [null]) {
                        trace(
                            expression.expression,
                            {
                                ...context,
                                accessPath: access ? [access] : [],
                            },
                            depth + 1,
                            nextSeen,
                        );
                    }
                }
            }
            if (
                ts.isElementAccessExpression(expression) &&
                ts.isIdentifier(expression.expression) &&
                [...(checker.getSymbolAtLocation(expression.expression)?.declarations ?? [])].some(
                    (declaration) => ts.isBindingElement(declaration) && declaration.dotDotDotToken,
                )
            ) {
                trace(expression.expression, context, depth + 1, nextSeen);
            }
            return;
        }
        if (ts.isCallExpression(expression)) {
            const resultType = checker.getTypeAtLocation(expression);
            const signature = checker.getResolvedSignature(expression);
            const declaration = signature?.declaration;
            if ((resultType.flags & ts.TypeFlags.Any) !== 0) {
                addFinding(
                    expression,
                    context.packageName,
                    `any request helper ${declaration ? functionDisplayName(declaration) : expression.expression.getText()}`,
                    "any",
                    context.expectedRequestType,
                );
            }
            if (
                context.atBoundaryValue &&
                requestNameFromType(checker, resultType) === context.expectedRequestType &&
                declaration &&
                (declaration.typeParameters?.length ?? 0) > 0 &&
                !declaration.body
            ) {
                addFinding(
                    declaration,
                    context.packageName,
                    `declaration-only request helper ${functionDisplayName(declaration)}`,
                    checker.typeToString(resultType),
                    context.expectedRequestType,
                );
            }
            for (const argument of expression.arguments) {
                trace(argument, { ...context, atBoundaryValue: false }, depth + 1, nextSeen);
            }
            if (declaration && ts.isFunctionLike(declaration) && declaration.body) {
                const substitutions = new Map(context.substitutions);
                declaration.parameters.forEach((parameter, index) => {
                    if (!expression.arguments[index]) return;
                    const symbol = checker.getSymbolAtLocation(parameter.name);
                    substitutions.set(symbol, expression.arguments[index]);
                    substitutions.set(unalias(checker, symbol), expression.arguments[index]);
                });
                const nestedContext = { ...context, substitutions };
                for (const returned of functionReturnExpressions(declaration)) {
                    trace(returned, nestedContext, depth + 1, nextSeen);
                }
            }
            return;
        }
        if (ts.isConditionalExpression(expression)) {
            trace(expression.whenTrue, context, depth + 1, nextSeen);
            trace(expression.whenFalse, context, depth + 1, nextSeen);
            return;
        }
        if (ts.isBinaryExpression(expression)) {
            if (expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                trace(expression.right, context, depth + 1, nextSeen);
            } else if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
                trace(expression.right, context, depth + 1, nextSeen);
            } else {
                trace(expression.left, context, depth + 1, nextSeen);
                trace(expression.right, context, depth + 1, nextSeen);
            }
            return;
        }
        if (ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression)) {
            for (const child of expression.properties ?? expression.elements ?? []) {
                if (ts.isPropertyAssignment(child)) {
                    trace(
                        child.initializer,
                        { ...context, atBoundaryValue: false },
                        depth + 1,
                        nextSeen,
                    );
                } else if (ts.isGetAccessorDeclaration(child)) {
                    for (const returned of functionReturnExpressions(child)) {
                        trace(
                            returned,
                            { ...context, atBoundaryValue: false },
                            depth + 1,
                            nextSeen,
                        );
                    }
                } else if (ts.isSpreadAssignment(child) || ts.isSpreadElement(child)) {
                    const childType = checker.getTypeAtLocation(child.expression);
                    trace(
                        child.expression,
                        {
                            ...context,
                            atBoundaryValue:
                                context.atBoundaryValue &&
                                typeMayCarryRequest(childType, context.expectedRequestType),
                        },
                        depth + 1,
                        nextSeen,
                    );
                } else if (ts.isExpression(child)) {
                    trace(child, context, depth + 1, nextSeen);
                }
            }
        }
    }

    function staticPropertyName(expression) {
        if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
        const argument = expression.argumentExpression;
        if (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument)) {
            return argument.text;
        }
        return null;
    }

    function propertyValueExpressions(expression, propertyName, depth = 0, seen = new Set()) {
        if (!expression || depth > MAX_TRACE_DEPTH) return [];
        const key = `${expression.getSourceFile().fileName}:${expression.pos}:${expression.end}`;
        if (seen.has(key)) return [];
        const nextSeen = new Set(seen);
        nextSeen.add(key);
        if (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isSatisfiesExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression)
        ) {
            return propertyValueExpressions(
                expression.expression,
                propertyName,
                depth + 1,
                nextSeen,
            );
        }
        if (ts.isIdentifier(expression)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
            const writes = reachingWrites(symbol, expression).writes;
            const values = writes.flatMap((write) =>
                propertyValueExpressions(write.value, propertyName, depth + 1, nextSeen),
            );
            if (values.length > 0) return values;
            for (const declaration of symbol?.declarations ?? []) {
                if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
                    values.push(
                        ...propertyValueExpressions(
                            declaration.initializer,
                            propertyName,
                            depth + 1,
                            nextSeen,
                        ),
                    );
                }
            }
            return values;
        }
        if (ts.isObjectLiteralExpression(expression)) {
            const values = [];
            for (const property of expression.properties) {
                const name = property.name
                    ?.getText(expression.getSourceFile())
                    .replace(/^['"]|['"]$/g, "");
                if (name !== propertyName) continue;
                if (ts.isPropertyAssignment(property)) values.push(property.initializer);
                if (ts.isShorthandPropertyAssignment(property)) values.push(property.name);
                if (ts.isGetAccessorDeclaration(property)) {
                    values.push(...functionReturnExpressions(property));
                }
            }
            return values;
        }
        return [];
    }

    function typesBeforeAnyErasure(
        expression,
        depth = 0,
        seen = new Set(),
        substitutions = new Map(),
    ) {
        if (!expression || depth > MAX_TRACE_DEPTH) return [];
        const key = `${expression.getSourceFile().fileName}:${expression.pos}:${expression.end}`;
        if (seen.has(key)) return [];
        const nextSeen = new Set(seen);
        nextSeen.add(key);

        if (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isSatisfiesExpression(expression) ||
            ts.isAwaitExpression(expression)
        ) {
            return typesBeforeAnyErasure(expression.expression, depth + 1, nextSeen, substitutions);
        }
        if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
            const asserted = checker.getTypeFromTypeNode(expression.type);
            if ((asserted.flags & ts.TypeFlags.Any) !== 0) {
                return typesBeforeAnyErasure(
                    expression.expression,
                    depth + 1,
                    nextSeen,
                    substitutions,
                );
            }
            return [checker.getTypeAtLocation(expression)];
        }
        if (ts.isIdentifier(expression)) {
            const current = checker.getTypeAtLocation(expression);
            if ((current.flags & ts.TypeFlags.Any) === 0) return [current];
            const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
            const substitution = substitutions.get(symbol);
            if (substitution) {
                return typesBeforeAnyErasure(substitution, depth + 1, nextSeen, substitutions);
            }
            const writes = reachingWrites(symbol, expression).writes;
            const recovered = writes.flatMap((write) =>
                typesBeforeAnyErasure(write.value, depth + 1, nextSeen, substitutions),
            );
            if (recovered.length > 0) return recovered;
            for (const argument of callArgumentsByParameter.get(symbol) ?? []) {
                recovered.push(
                    ...typesBeforeAnyErasure(argument, depth + 1, nextSeen, substitutions),
                );
            }
            if (recovered.length > 0) return recovered;
            for (const declaration of symbol?.declarations ?? []) {
                if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
                    recovered.push(
                        ...typesBeforeAnyErasure(
                            declaration.initializer,
                            depth + 1,
                            nextSeen,
                            substitutions,
                        ),
                    );
                }
            }
            return recovered.length > 0 ? recovered : [current];
        }
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
            const current = checker.getTypeAtLocation(expression);
            if ((current.flags & ts.TypeFlags.Any) === 0) return [current];
            const symbol = unalias(
                checker,
                checker.getSymbolAtLocation(expression.name ?? expression.argumentExpression),
            );
            const written = reachingWrites(symbol, expression).writes.flatMap((write) =>
                typesBeforeAnyErasure(
                    write.value,
                    depth + 1,
                    nextSeen,
                    new Map([...substitutions, ...(write.substitutions ?? [])]),
                ),
            );
            if (written.length > 0) return written;
            const propertyName = staticPropertyName(expression);
            if (propertyName == null) return [current];
            const recovered = propertyValueExpressions(expression.expression, propertyName).flatMap(
                (value) => typesBeforeAnyErasure(value, depth + 1, nextSeen, substitutions),
            );
            if (recovered.length > 0) return recovered;
            for (const receiverType of typesBeforeAnyErasure(
                expression.expression,
                depth + 1,
                nextSeen,
                substitutions,
            )) {
                const property = checker.getPropertyOfType(
                    checker.getApparentType(receiverType),
                    propertyName,
                );
                if (property) {
                    recovered.push(checker.getTypeOfSymbolAtLocation(property, expression));
                }
            }
            return recovered.length > 0 ? recovered : [current];
        }
        if (ts.isCallExpression(expression)) {
            const current = checker.getTypeAtLocation(expression);
            if ((current.flags & ts.TypeFlags.Any) === 0) return [current];
            const declaration = checker.getResolvedSignature(expression)?.declaration;
            if (declaration && ts.isFunctionLike(declaration) && declaration.body) {
                const nestedSubstitutions = new Map(substitutions);
                declaration.parameters.forEach((parameter, index) => {
                    const argument = expression.arguments[index];
                    if (!argument) return;
                    const symbol = unalias(checker, checker.getSymbolAtLocation(parameter.name));
                    if (symbol) nestedSubstitutions.set(symbol, argument);
                });
                const recovered = functionReturnExpressions(declaration).flatMap((returned) =>
                    typesBeforeAnyErasure(returned, depth + 1, nextSeen, nestedSubstitutions),
                );
                if (recovered.length > 0) return recovered;
            }
            return [current];
        }
        return [checker.getTypeAtLocation(expression)];
    }

    function addSignatureBoundaries(boundaries, call, signature, argumentOffset = 0) {
        signature.parameters.forEach((parameter, index) => {
            const argument = call.arguments[index + argumentOffset];
            if (!argument) return;
            const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
            const expectedType = checker.getTypeOfSymbolAtLocation(parameter, declaration ?? call);
            const expectedRequestType =
                requestNameFromType(checker, expectedType) ??
                requestNameFromTypeNode(checker, declaration?.type);
            if (
                expectedRequestType &&
                !boundaries.some(
                    (boundary) =>
                        boundary.argument === argument &&
                        boundary.expectedRequestType === expectedRequestType,
                )
            ) {
                boundaries.push({ argument, expectedRequestType });
            }
        });
    }

    function isFunctionCallTrampoline(expression, depth = 0, seen = new Set()) {
        if (!expression || depth > MAX_TRACE_DEPTH) return false;
        const key = `${expression.getSourceFile().fileName}:${expression.pos}:${expression.end}`;
        if (seen.has(key)) return false;
        const nextSeen = new Set(seen);
        nextSeen.add(key);
        while (
            ts.isParenthesizedExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression) ||
            ts.isNonNullExpression(expression)
        ) {
            expression = expression.expression;
        }
        if (
            ts.isPropertyAccessExpression(expression) &&
            expression.name.text === "call" &&
            ts.isPropertyAccessExpression(expression.expression) &&
            expression.expression.name.text === "prototype" &&
            ts.isIdentifier(expression.expression.expression) &&
            expression.expression.expression.text === "Function"
        ) {
            return true;
        }
        if (ts.isIdentifier(expression)) {
            const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
            return reachingWrites(symbol, expression).writes.some((write) =>
                isFunctionCallTrampoline(write.value, depth + 1, nextSeen),
            );
        }
        return false;
    }

    function requestBoundaryArguments(call) {
        const boundaries = [];
        const callee = call.expression;
        if (
            ts.isPropertyAccessExpression(callee) &&
            ["call", "apply", "bind"].includes(callee.name.text)
        ) {
            const invocation = callee.name.text;
            if (
                invocation === "call" &&
                isFunctionCallTrampoline(callee.expression) &&
                call.arguments[1]
            ) {
                for (const targetType of typesBeforeAnyErasure(call.arguments[1])) {
                    for (const signature of targetType.getCallSignatures()) {
                        addSignatureBoundaries(boundaries, call, signature, 2);
                    }
                }
                return boundaries;
            }
            const targetSignatures = typesBeforeAnyErasure(callee.expression).flatMap((type) =>
                type.getCallSignatures(),
            );
            for (const signature of targetSignatures) {
                signature.parameters.forEach((parameter, parameterIndex) => {
                    const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
                    const expectedType = checker.getTypeOfSymbolAtLocation(
                        parameter,
                        declaration ?? call,
                    );
                    const expectedRequestType =
                        requestNameFromType(checker, expectedType) ??
                        requestNameFromTypeNode(checker, declaration?.type);
                    if (!expectedRequestType) return;
                    if (invocation === "apply") {
                        if (parameterIndex === 0 && call.arguments[1]) {
                            boundaries.push({
                                argument: call.arguments[1],
                                expectedRequestType,
                            });
                        }
                    } else if (call.arguments[parameterIndex + 1]) {
                        boundaries.push({
                            argument: call.arguments[parameterIndex + 1],
                            expectedRequestType,
                        });
                    }
                });
            }
            return boundaries;
        }

        const signature = checker.getResolvedSignature(call);
        if (signature) addSignatureBoundaries(boundaries, call, signature);
        for (const recoveredType of typesBeforeAnyErasure(call.expression)) {
            for (const recoveredSignature of recoveredType.getCallSignatures()) {
                addSignatureBoundaries(boundaries, call, recoveredSignature);
            }
        }
        return boundaries;
    }

    for (const [packageName, relativeRoot] of Object.entries(packageRoots)) {
        const absoluteRoot = normalize(path.resolve(root, relativeRoot));
        for (const sourceFile of program.getSourceFiles()) {
            const sourceName = normalize(path.resolve(sourceFile.fileName));
            if (
                sourceFile.isDeclarationFile ||
                !(sourceName === absoluteRoot || sourceName.startsWith(`${absoluteRoot}/`))
            ) {
                continue;
            }
            function visit(node) {
                if (ts.isCallExpression(node)) {
                    for (const { argument, expectedRequestType } of requestBoundaryArguments(
                        node,
                    )) {
                        trace(argument, {
                            expectedRequestType,
                            packageName,
                            atBoundaryValue: true,
                            substitutions: new Map(),
                        });
                    }
                }
                if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
                    const generated =
                        requestNameFromTypeNode(checker, node.type) ??
                        requestNameFromType(checker, checker.getTypeFromTypeNode(node.type));
                    if (generated) {
                        addFinding(
                            node,
                            packageName,
                            "generated request assertion",
                            node.type.getText(sourceFile),
                            generated,
                        );
                    }
                }
                ts.forEachChild(node, visit);
            }
            visit(sourceFile);
        }
    }
    const escapeFailures = [];
    if (nonEmptyString(forbiddenIdentifier)) {
        const absoluteRoot = normalize(path.resolve(root));
        for (const sourceFile of program.getSourceFiles()) {
            const sourceName = normalize(path.resolve(sourceFile.fileName));
            if (
                sourceFile.isDeclarationFile ||
                !(sourceName === absoluteRoot || sourceName.startsWith(`${absoluteRoot}/`)) ||
                sourceName.includes("/node_modules/")
            ) {
                continue;
            }
            function visit(node) {
                if (ts.isIdentifier(node) && node.text === forbiddenIdentifier) {
                    escapeFailures.push(
                        `forbidden request escape \`${forbiddenIdentifier}\` in import closure at ${sourceRelative(root, sourceFile)}:${nodeLine(sourceFile, node)}`,
                    );
                }
                ts.forEachChild(node, visit);
            }
            visit(sourceFile);
        }
    }
    const analysisStats = { work: analysisWork, exhausted: analysisExhausted };
    if (largestCallbackExpansion > 0) {
        analysisStats.largestCallbackExpansion = largestCallbackExpansion;
    }
    return {
        findings,
        escapeFailures: [...escapeFailures, ...analysisFailures],
        analysisStats,
    };
}

function exceptionLocationMatches(exception, finding, source) {
    if (exception.file !== finding.file) return false;
    if (nonEmptyString(exception.codeMarker)) {
        const markerLines = source
            .split("\n")
            .map((line, index) => (line.includes(exception.codeMarker) ? index + 1 : null))
            .filter((line) => line !== null);
        return markerLines.length === 1 && markerLines[0] === finding.line;
    }
    const start = exception.range?.startLine;
    const end = exception.range?.endLine;
    return (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start > 0 &&
        end >= start &&
        finding.line >= start &&
        finding.line <= end
    );
}

async function validateException({
    root,
    packageName,
    exception,
    findings,
    sources,
    riskRegister,
    discrepancies,
    makefile,
}) {
    const label = `requestCastGovernance.exceptions.${packageName}`;
    const failures = [];
    for (const field of [
        "id",
        "file",
        "generatedRequestType",
        "discrepancyId",
        "openRiskId",
        "exactClosureGate",
    ]) {
        if (!nonEmptyString(exception?.[field]))
            failures.push(`${label}.${field} must be a non-empty string`);
    }
    const hasMarker = nonEmptyString(exception?.codeMarker);
    const hasRange = exception?.range != null;
    if (hasMarker === hasRange)
        failures.push(`${label}.file/range or codeMarker must select exactly one stable location`);
    if (hasRange) {
        if (
            !Number.isInteger(exception.range?.startLine) ||
            !Number.isInteger(exception.range?.endLine)
        ) {
            failures.push(`${label}.range requires integer startLine and endLine`);
        } else if (
            exception.range.startLine <= 0 ||
            exception.range.endLine < exception.range.startLine
        ) {
            failures.push(`${label}.range must be a positive ordered line range`);
        }
    }
    if (
        exception?.evidence == null ||
        typeof exception.evidence !== "object" ||
        Array.isArray(exception.evidence)
    ) {
        failures.push(`${label}.evidence must be an object`);
    } else {
        if (!nonEmptyString(exception.evidence.path))
            failures.push(`${label}.evidence.path must be a non-empty string`);
        if (!nonEmptyString(exception.evidence.anchor))
            failures.push(`${label}.evidence.anchor must be a non-empty string`);
    }

    const source = nonEmptyString(exception?.file) ? sources.get(exception.file) : null;
    if (nonEmptyString(exception?.file) && source == null)
        failures.push(`${label}.file does not exist in its governed source root`);
    if (source != null && hasMarker) {
        const occurrences = source.split(exception.codeMarker).length - 1;
        if (occurrences !== 1)
            failures.push(`${label}.codeMarker must exist exactly once; found ${occurrences}`);
    }
    if (
        nonEmptyString(exception?.discrepancyId) &&
        !discrepancies?.includes(`\`${exception.discrepancyId}\``)
    ) {
        failures.push(`${label}.discrepancyId does not exist in spec/evidence/discrepancies.md`);
    }
    const risk = riskRegister?.risks?.find((entry) => entry?.id === exception?.openRiskId);
    if (nonEmptyString(exception?.openRiskId) && (!risk || risk.status !== "open")) {
        failures.push(`${label}.openRiskId must reference an existing open risk`);
    }
    if (
        risk &&
        nonEmptyString(exception?.exactClosureGate) &&
        !exactMakeTargets(risk.closureGate).has(exception.exactClosureGate)
    ) {
        failures.push(
            `${label}.exactClosureGate is not an exact Make target owned by the referenced open risk`,
        );
    }
    if (
        nonEmptyString(exception?.exactClosureGate) &&
        !makefileHasExactTarget(makefile, exception.exactClosureGate)
    ) {
        failures.push(`${label}.exactClosureGate target does not exist in Makefile`);
    }
    if (nonEmptyString(exception?.evidence?.path) && nonEmptyString(exception?.evidence?.anchor)) {
        const evidence = await readText(root, exception.evidence.path);
        if (evidence == null) failures.push(`${label}.evidence.path does not exist`);
        else if (!evidence.includes(exception.evidence.anchor))
            failures.push(`${label}.evidence.anchor does not exist`);
    }

    const locationMatches =
        source == null
            ? []
            : findings.filter((item) => exceptionLocationMatches(exception, item, source));
    if (
        locationMatches.length === 1 &&
        exception?.generatedRequestType !== locationMatches[0].expectedRequestType
    ) {
        failures.push(
            `${label}.generatedRequestType must exactly equal finding type ${locationMatches[0].expectedRequestType}`,
        );
    }
    const matches = locationMatches.filter(
        (item) => exception?.generatedRequestType === item.expectedRequestType,
    );
    if (matches.length !== 1)
        failures.push(
            `${label} is stale or orphaned; expected exactly one governed cast, found ${matches.length}`,
        );
    return { failures, matches };
}

export async function validateConsumerCastGovernance({ root, contract, analysisLimits }) {
    const failures = [];
    const findings = [];
    const sources = new Map();
    if (contract?.schemaVersion !== 2) failures.push("schemaVersion must be 2");
    const governance = contract?.requestCastGovernance;
    if (governance == null || typeof governance !== "object" || Array.isArray(governance)) {
        return { failures: [...failures, "requestCastGovernance must be an object"], findings };
    }
    if (typeof governance.canonicalZeroBaseline !== "boolean")
        failures.push("requestCastGovernance.canonicalZeroBaseline must be boolean");
    for (const packageName of ["cli", "mcp"]) {
        if (!nonEmptyString(governance.sourceRoots?.[packageName]))
            failures.push(
                `requestCastGovernance.sourceRoots.${packageName} must be a non-empty string`,
            );
        if (!Array.isArray(governance.exceptions?.[packageName]))
            failures.push(`requestCastGovernance.exceptions.${packageName} must be an array`);
    }

    const rootNames = [];
    for (const [packageName, relativeRoot] of Object.entries(governance.sourceRoots ?? {})) {
        if (!nonEmptyString(relativeRoot)) continue;
        for (const relativePath of await listTypeScript(root, relativeRoot)) {
            rootNames.push(path.join(root, relativePath));
            sources.set(relativePath, await readFile(path.join(root, relativePath), "utf8"));
        }
    }
    let analysis;
    try {
        analysis = analyzeProgram({
            root,
            rootNames,
            packageRoots: governance.sourceRoots ?? {},
            forbiddenIdentifier:
                contract?.forbiddenRequestEscape?.importClosure === true
                    ? contract.forbiddenRequestEscape.identifier
                    : null,
            analysisLimits,
        });
    } catch (error) {
        if (!(error instanceof AnalysisWorkLimitError)) throw error;
        const analysisStats = { work: error.work, exhausted: true };
        if (error.largestCallbackExpansion > 0) {
            analysisStats.largestCallbackExpansion = error.largestCallbackExpansion;
        }
        analysis = {
            findings: [],
            escapeFailures: [error.message],
            analysisStats,
        };
    }
    findings.push(...analysis.findings);
    failures.push(...analysis.escapeFailures);

    const [riskText, discrepancies, makefile] = await Promise.all([
        readText(root, "docs/risk-register.json"),
        readText(root, "spec/evidence/discrepancies.md"),
        readText(root, "Makefile"),
    ]);
    let riskRegister = null;
    try {
        riskRegister = riskText == null ? null : JSON.parse(riskText);
    } catch {
        failures.push("docs/risk-register.json must contain valid JSON");
    }
    const matchedFindings = new Set();
    const exceptionIds = new Set();
    for (const packageName of ["cli", "mcp"]) {
        const exceptions = Array.isArray(governance.exceptions?.[packageName])
            ? governance.exceptions[packageName]
            : [];
        if (governance.canonicalZeroBaseline === true && exceptions.length > 0)
            failures.push(
                `requestCastGovernance.exceptions.${packageName} must stay empty in the canonical zero baseline`,
            );
        for (const exception of exceptions) {
            if (nonEmptyString(exception?.id)) {
                if (exceptionIds.has(exception.id))
                    failures.push(
                        `requestCastGovernance exception id ${exception.id} must be unique`,
                    );
                exceptionIds.add(exception.id);
            }
            const validation = await validateException({
                root,
                packageName,
                exception,
                findings: findings.filter((item) => item.packageName === packageName),
                sources,
                riskRegister,
                discrepancies,
                makefile,
            });
            failures.push(...validation.failures);
            for (const item of validation.matches) {
                if (matchedFindings.has(item))
                    failures.push(
                        `requestCastGovernance exception ${exception?.id ?? "(missing id)"} duplicates ${item.file}:${item.line}`,
                    );
                matchedFindings.add(item);
            }
        }
    }
    for (const item of findings) {
        if (!matchedFindings.has(item))
            failures.push(
                `${item.kind} \`as ${item.assertedType}\` for ${item.expectedRequestType} at ${item.file}:${item.line}`,
            );
    }
    return { failures, findings, analysisStats: analysis.analysisStats };
}
