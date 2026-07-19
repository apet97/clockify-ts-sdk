import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

async function listTypeScript(root, relativeRoot) {
    const files = [];
    const stack = [relativeRoot];
    while (stack.length > 0) {
        const directory = stack.pop();
        for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
            const relativePath = path.join(directory, entry.name);
            if (entry.isDirectory()) stack.push(relativePath);
            else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relativePath);
        }
    }
    return files.sort();
}

function requestClientCall(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
    const receiver = node.expression.expression.getText();
    return /(?:^|\.)(?:client|clockify)(?:\.|$)/.test(receiver);
}

function belongsToRequestCall(node) {
    let cursor = node;
    while (cursor.parent) {
        cursor = cursor.parent;
        if (requestClientCall(cursor)) return cursor.arguments.some((argument) => argument === node || argument.pos <= node.pos && argument.end >= node.end);
        if (ts.isStatement(cursor) || ts.isFunctionLike(cursor)) return false;
    }
    return false;
}

function finding(relativePath, sourceFile, node, kind, assertedType) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { file: relativePath, line: line + 1, kind, assertedType };
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

function isGeneratedRequestType(typeNode, sourceFile) {
    if (!ts.isTypeReferenceNode(typeNode)) return false;
    const name = typeNode.typeName.getText(sourceFile);
    return /(?:^|\.)[A-Za-z_$][A-Za-z0-9_$]*Request$/.test(name);
}

function functionName(node) {
    if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
    if (
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)
    ) {
        return node.parent.name.text;
    }
    return null;
}

function blanketCastInFunction(node, sourceFile) {
    const typeParameters = new Set((node.typeParameters ?? []).map((parameter) => parameter.name.text));
    let blanket = null;
    function visit(candidate) {
        if (blanket) return;
        if (ts.isAsExpression(candidate) || ts.isTypeAssertionExpression(candidate)) {
            const assertedType = candidate.type.getText(sourceFile);
            if (["any", "never"].includes(assertedType) || typeParameters.has(assertedType)) {
                blanket = candidate;
                return;
            }
        }
        ts.forEachChild(candidate, visit);
    }
    if (node.body) visit(node.body);
    return blanket;
}

function anyBoundaryInFunction(node) {
    for (const parameter of node.parameters) {
        if (parameter.type?.kind === ts.SyntaxKind.AnyKeyword) return parameter.type;
    }
    if (node.type?.kind === ts.SyntaxKind.AnyKeyword) return node.type;
    return null;
}

function calledIdentifiers(node) {
    const names = new Set();
    function visit(candidate) {
        if (ts.isCallExpression(candidate) && ts.isIdentifier(candidate.expression)) {
            names.add(candidate.expression.text);
        }
        ts.forEachChild(candidate, visit);
    }
    visit(node);
    return names;
}

function scanSource(relativePath, source) {
    const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const findings = [];
    const blanketHelpers = new Map();
    const requestHelperCalls = new Set();
    function discoverHelpers(node) {
        if (ts.isFunctionLike(node)) {
            const name = functionName(node);
            const blanket = blanketCastInFunction(node, sourceFile);
            const anyBoundary = anyBoundaryInFunction(node);
            if (name && anyBoundary) blanketHelpers.set(name, { node: anyBoundary, kind: "any request helper" });
            else if (name && blanket) blanketHelpers.set(name, { node: blanket, kind: "request helper" });
        }
        ts.forEachChild(node, discoverHelpers);
    }
    discoverHelpers(sourceFile);

    function visit(node) {
        if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
            const assertedType = node.type.getText(sourceFile);
            if (
                isGeneratedRequestType(node.type, sourceFile) ||
                (assertedType === "never" && belongsToRequestCall(node))
            ) {
                findings.push(finding(relativePath, sourceFile, node, "request assertion", assertedType));
            }
        }
        if (requestClientCall(node)) {
            for (const argument of node.arguments) {
                for (const helperName of calledIdentifiers(argument)) {
                    requestHelperCalls.add(helperName);
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return { findings, blanketHelpers, requestHelperCalls, sourceFile };
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
    return Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start && finding.line >= start && finding.line <= end;
}

async function validateException({ root, packageName, exception, findings, sources, riskRegister, discrepancies, makefile }) {
    const label = `requestCastGovernance.exceptions.${packageName}`;
    const failures = [];
    for (const field of ["id", "file", "generatedRequestType", "discrepancyId", "openRiskId", "exactClosureGate"]) {
        if (!nonEmptyString(exception?.[field])) failures.push(`${label}.${field} must be a non-empty string`);
    }
    const hasMarker = nonEmptyString(exception?.codeMarker);
    const hasRange = exception?.range != null;
    if (hasMarker === hasRange) {
        failures.push(`${label}.file/range or codeMarker must select exactly one stable location`);
    }
    if (hasRange) {
        if (!Number.isInteger(exception.range?.startLine) || !Number.isInteger(exception.range?.endLine)) {
            failures.push(`${label}.range requires integer startLine and endLine`);
        } else if (exception.range.startLine <= 0 || exception.range.endLine < exception.range.startLine) {
            failures.push(`${label}.range must be a positive ordered line range`);
        }
    }
    if (exception?.evidence == null || typeof exception.evidence !== "object" || Array.isArray(exception.evidence)) {
        failures.push(`${label}.evidence must be an object`);
    } else {
        if (!nonEmptyString(exception.evidence.path)) failures.push(`${label}.evidence.path must be a non-empty string`);
        if (!nonEmptyString(exception.evidence.anchor)) failures.push(`${label}.evidence.anchor must be a non-empty string`);
    }

    const source = nonEmptyString(exception?.file) ? sources.get(exception.file) : null;
    if (nonEmptyString(exception?.file) && source == null) failures.push(`${label}.file does not exist in its governed source root`);
    if (source != null && hasMarker) {
        const occurrences = source.split(exception.codeMarker).length - 1;
        if (occurrences !== 1) failures.push(`${label}.codeMarker must exist exactly once; found ${occurrences}`);
    }
    if (nonEmptyString(exception?.generatedRequestType) && !/(?:^|\.)[A-Za-z_$][A-Za-z0-9_$]*Request$/.test(exception.generatedRequestType)) {
        failures.push(`${label}.generatedRequestType must name an exact generated *Request type`);
    }
    if (nonEmptyString(exception?.discrepancyId) && !discrepancies?.includes(`\`${exception.discrepancyId}\``)) {
        failures.push(`${label}.discrepancyId does not exist in spec/evidence/discrepancies.md`);
    }
    const risk = riskRegister?.risks?.find((entry) => entry?.id === exception?.openRiskId);
    if (nonEmptyString(exception?.openRiskId) && (!risk || risk.status !== "open")) {
        failures.push(`${label}.openRiskId must reference an existing open risk`);
    }
    if (risk && nonEmptyString(exception?.exactClosureGate) && !risk.closureGate?.includes(exception.exactClosureGate)) {
        failures.push(`${label}.exactClosureGate is not owned by the referenced open risk`);
    }
    if (nonEmptyString(exception?.exactClosureGate) && !makefile?.includes(`${exception.exactClosureGate}:`)) {
        failures.push(`${label}.exactClosureGate target does not exist in Makefile`);
    }
    if (nonEmptyString(exception?.evidence?.path) && nonEmptyString(exception?.evidence?.anchor)) {
        const evidence = await readText(root, exception.evidence.path);
        if (evidence == null) failures.push(`${label}.evidence.path does not exist`);
        else if (!evidence.includes(exception.evidence.anchor)) failures.push(`${label}.evidence.anchor does not exist`);
    }

    const matches = source == null ? [] : findings.filter((item) => exceptionLocationMatches(exception, item, source));
    if (matches.length !== 1) failures.push(`${label} is stale or orphaned; expected exactly one governed cast, found ${matches.length}`);
    return { failures, matches };
}

export async function validateConsumerCastGovernance({ root, contract }) {
    const failures = [];
    const findings = [];
    const sources = new Map();
    const helpersByPackage = new Map();
    const helperCallsByPackage = new Map();
    if (contract?.schemaVersion !== 2) failures.push("schemaVersion must be 2");
    const governance = contract?.requestCastGovernance;
    if (governance == null || typeof governance !== "object" || Array.isArray(governance)) {
        return { failures: [...failures, "requestCastGovernance must be an object"], findings };
    }
    if (typeof governance.canonicalZeroBaseline !== "boolean") {
        failures.push("requestCastGovernance.canonicalZeroBaseline must be boolean");
    }
    for (const packageName of ["cli", "mcp"]) {
        if (!nonEmptyString(governance.sourceRoots?.[packageName])) {
            failures.push(`requestCastGovernance.sourceRoots.${packageName} must be a non-empty string`);
        }
        if (!Array.isArray(governance.exceptions?.[packageName])) {
            failures.push(`requestCastGovernance.exceptions.${packageName} must be an array`);
        }
    }
    for (const [packageName, relativeRoot] of Object.entries(governance.sourceRoots ?? {})) {
        if (!nonEmptyString(relativeRoot)) continue;
        for (const relativePath of await listTypeScript(root, relativeRoot)) {
            const source = await readFile(path.join(root, relativePath), "utf8");
            sources.set(relativePath, source);
            const analysis = scanSource(relativePath, source);
            findings.push(...analysis.findings.map((item) => ({ ...item, packageName })));
            const packageHelpers = helpersByPackage.get(packageName) ?? new Map();
            for (const [name, helper] of analysis.blanketHelpers) {
                const entries = packageHelpers.get(name) ?? [];
                entries.push({ ...helper, relativePath, sourceFile: analysis.sourceFile });
                packageHelpers.set(name, entries);
            }
            helpersByPackage.set(packageName, packageHelpers);
            const packageCalls = helperCallsByPackage.get(packageName) ?? new Set();
            for (const name of analysis.requestHelperCalls) packageCalls.add(name);
            helperCallsByPackage.set(packageName, packageCalls);
        }
    }
    for (const [packageName, helperNames] of helperCallsByPackage) {
        const helpers = helpersByPackage.get(packageName) ?? new Map();
        for (const helperName of helperNames) {
            for (const helper of helpers.get(helperName) ?? []) {
                findings.push({
                    ...finding(
                        helper.relativePath,
                        helper.sourceFile,
                        helper.node,
                        `${helper.kind} ${helperName}`,
                        "blanket",
                    ),
                    packageName,
                });
            }
        }
    }

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
        const exceptions = Array.isArray(governance.exceptions?.[packageName]) ? governance.exceptions[packageName] : [];
        if (governance.canonicalZeroBaseline === true && exceptions.length > 0) {
            failures.push(`requestCastGovernance.exceptions.${packageName} must stay empty in the canonical zero baseline`);
        }
        for (const exception of exceptions) {
            if (nonEmptyString(exception?.id)) {
                if (exceptionIds.has(exception.id)) {
                    failures.push(`requestCastGovernance exception id ${exception.id} must be unique`);
                }
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
                if (matchedFindings.has(item)) {
                    failures.push(
                        `requestCastGovernance exception ${exception?.id ?? "(missing id)"} duplicates ${item.file}:${item.line}`,
                    );
                }
                matchedFindings.add(item);
            }
        }
    }
    for (const item of findings) {
        if (!matchedFindings.has(item)) failures.push(`${item.kind} \`as ${item.assertedType}\` at ${item.file}:${item.line}`);
    }
    return { failures, findings };
}
