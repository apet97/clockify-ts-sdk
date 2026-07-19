import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const MAX_TRACE_DEPTH = 24;

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

function analyzeProgram({ root, rootNames, packageRoots, forbiddenIdentifier }) {
    const program = createProgram(rootNames);
    const checker = program.getTypeChecker();
    const findings = [];
    const findingKeys = new Set();
    const writesBySymbol = new Map();
    const wildcardPropertyWrites = [];
    const callArgumentsByParameter = new Map();

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
                        .map((name) => unalias(checker, checker.getPropertyOfType(receiverType, name)))
                        .filter(Boolean),
                ),
            ];
        }
        return [];
    }

    function symbolForWriteTarget(target) {
        return symbolsForWriteTarget(target)[0] ?? null;
    }

    function addWrite(target, value, position, declaredType = null) {
        const write = {
            value,
            position,
            sourceFile: target.getSourceFile(),
            node: target,
            declaredType,
        };
        const symbols = symbolsForWriteTarget(target);
        if (symbols.length === 0 && ts.isElementAccessExpression(target)) {
            wildcardPropertyWrites.push(write);
            return;
        }
        for (const symbol of symbols) {
            const writes = writesBySymbol.get(symbol) ?? [];
            writes.push(write);
            writesBySymbol.set(symbol, writes);
        }
    }

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        function indexWrites(node) {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
                addWrite(node.name, node.initializer, node.pos, node.type);
            }
            if (ts.isPropertyDeclaration(node) && node.initializer) {
                addWrite(node.name, node.initializer, node.pos, node.type);
            }
            if (
                ts.isBinaryExpression(node) &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                (ts.isIdentifier(node.left) ||
                    ts.isPropertyAccessExpression(node.left) ||
                    ts.isElementAccessExpression(node.left))
            ) {
                addWrite(node.left, node.right, node.pos);
            }
            ts.forEachChild(node, indexWrites);
        }
        indexWrites(sourceFile);
    }

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        function indexCallArguments(node) {
            if (ts.isCallExpression(node)) {
                const declaration = checker.getResolvedSignature(node)?.declaration;
                if (declaration && ts.isFunctionLike(declaration)) {
                    declaration.parameters.forEach((parameter, index) => {
                        const argument = node.arguments[index];
                        if (!argument) return;
                        const symbol = unalias(
                            checker,
                            checker.getSymbolAtLocation(parameter.name),
                        );
                        if (!symbol) return;
                        const inputs = callArgumentsByParameter.get(symbol) ?? [];
                        inputs.push(argument);
                        callArgumentsByParameter.set(symbol, inputs);
                    });
                }
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

    function receiverOrigins(expression, beforePosition, seen = new Set()) {
        if (
            ts.isParenthesizedExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isSatisfiesExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isTypeAssertionExpression(expression)
        ) {
            return receiverOrigins(expression.expression, beforePosition, seen);
        }
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
            return receiverOrigins(expression.expression, beforePosition, seen);
        }
        if (!ts.isIdentifier(expression)) return new Set();
        const symbol = unalias(checker, checker.getSymbolAtLocation(expression));
        if (!symbol || seen.has(symbol)) return new Set();
        const nextSeen = new Set(seen);
        nextSeen.add(symbol);
        const origins = new Set();
        for (const write of writesBySymbol.get(symbol) ?? []) {
            if (write.position >= beforePosition) continue;
            for (const origin of receiverOrigins(write.value, write.position, nextSeen)) {
                origins.add(origin);
            }
        }
        if (origins.size === 0) origins.add(symbol);
        return origins;
    }

    function writeMayReachExpression(write, expression) {
        if (
            !(ts.isPropertyAccessExpression(write.node) ||
                ts.isElementAccessExpression(write.node)) ||
            !(ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression))
        ) {
            return true;
        }
        const writeOrigins = receiverOrigins(write.node.expression, write.position);
        const useOrigins = receiverOrigins(expression.expression, expression.pos);
        if (writeOrigins.size === 0 || useOrigins.size === 0) return true;
        return [...writeOrigins].some((origin) => useOrigins.has(origin));
    }

    function reachingWrites(symbol, expression) {
        const wildcardWrites =
            ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
                ? wildcardPropertyWrites
                : [];
        const writes = [...(writesBySymbol.get(symbol) ?? []), ...wildcardWrites]
            .filter(
                (write) =>
                    write.sourceFile === expression.getSourceFile() &&
                    write.position < expression.pos &&
                    writeMayReachExpression(write, expression),
            )
            .sort((left, right) => left.position - right.position)
            .filter((write, index, all) => index === 0 || write !== all[index - 1]);
        const cutoff = latestDefiniteWriteCutoff(symbol, expression);
        return {
            hasDominator: cutoff != null,
            writes: cutoff == null ? writes : writes.filter((write) => write.position >= cutoff),
        };
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
            trace(write.value, context, depth + 1, seen);
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
            steps.push({
                binding: current,
                key: ts.isObjectBindingPattern(pattern)
                    ? (current.propertyName ?? current.name)
                          .getText(current.getSourceFile())
                          .replace(/^['"]|['"]$/g, "")
                    : pattern.elements.indexOf(current),
            });
            if (ts.isVariableDeclaration(pattern.parent)) {
                declaration = pattern.parent;
                break;
            }
            current = pattern.parent;
        }
        if (!declaration?.initializer) return;
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
                traceStep(
                    step.binding.initializer,
                    stepIndex + 1,
                    propertyDepth + 1,
                    propertySeen,
                );
            }
            if (!selected.known) {
                trace(source, context, propertyDepth + 1, propertySeen);
            }
        }

        traceStep(declaration.initializer, 0, depth + 1, seen);
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
            return typesBeforeAnyErasure(
                expression.expression,
                depth + 1,
                nextSeen,
                substitutions,
            );
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
                return typesBeforeAnyErasure(
                    substitution,
                    depth + 1,
                    nextSeen,
                    substitutions,
                );
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
            const propertyName = staticPropertyName(expression);
            if (propertyName == null) return [current];
            const recovered = propertyValueExpressions(
                expression.expression,
                propertyName,
            ).flatMap((value) =>
                typesBeforeAnyErasure(value, depth + 1, nextSeen, substitutions),
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
                    const symbol = unalias(
                        checker,
                        checker.getSymbolAtLocation(parameter.name),
                    );
                    if (symbol) nestedSubstitutions.set(symbol, argument);
                });
                const recovered = functionReturnExpressions(declaration).flatMap((returned) =>
                    typesBeforeAnyErasure(
                        returned,
                        depth + 1,
                        nextSeen,
                        nestedSubstitutions,
                    ),
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

    function requestBoundaryArguments(call) {
        const boundaries = [];
        const callee = call.expression;
        if (
            ts.isPropertyAccessExpression(callee) &&
            ["call", "apply", "bind"].includes(callee.name.text)
        ) {
            const invocation = callee.name.text;
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
    return { findings, escapeFailures };
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

export async function validateConsumerCastGovernance({ root, contract }) {
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
    const analysis = analyzeProgram({
        root,
        rootNames,
        packageRoots: governance.sourceRoots ?? {},
        forbiddenIdentifier:
            contract?.forbiddenRequestEscape?.importClosure === true
                ? contract.forbiddenRequestEscape.identifier
                : null,
    });
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
    return { failures, findings };
}
