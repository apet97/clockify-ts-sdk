import ts from "typescript";

export const CANONICAL_CONSUMER_CAST_CONTRACT = Object.freeze({
    schemaVersion: 2,
    sourceRoots: Object.freeze({ cli: "cli/src", mcp: "mcp/src" }),
    exceptionPackages: Object.freeze(["cli", "mcp"]),
    forbiddenRequestEscape: Object.freeze({
        identifier: "wireBody",
        roots: Object.freeze([
            "wrapper/tests",
            "wrapper/examples",
            "cli/src",
            "cli/tests",
            "mcp/src",
            "mcp/tests",
        ]),
        wrapperRootTypeScript: true,
        importClosure: true,
    }),
    publicNoAnyProof: Object.freeze({
        path: "wrapper/tests/types/breaking-changes.test-d.ts",
        compilerGate: "consumer-cast-budget",
        compilerCommand: "npm run type-check:breaking -w clockify-sdk-ts-115",
        contains: Object.freeze([
            "_GetInputIsNotAny",
            "_ArchiveInputIsNotAny",
            "_DeleteInputIsNotAny",
            "_RootGetInputIsNotAny",
            "_RootArchiveInputIsNotAny",
            "_RootDeleteInputIsNotAny",
        ]),
        isAnyDefinition: "0extends1&T?true:false",
        assertFalseDefinition: "Textendsfalse=T",
        requiredBuiltins: Object.freeze(["Parameters"]),
        adapterAliases: Object.freeze({
            Adapter: Object.freeze({
                typeName: "ArchiveThenDeleteAdapter",
                importedName: "ArchiveThenDeleteAdapter",
                module: "clockify-sdk-ts-115/ensure",
                typeArguments: Object.freeze(["CurrentClient"]),
            }),
            RootAdapter: Object.freeze({
                typeName: "RootArchiveThenDeleteAdapter",
                importedName: "ArchiveThenDeleteAdapter",
                module: "clockify-sdk-ts-115",
                typeArguments: Object.freeze(["CurrentClient"]),
            }),
        }),
        operands: Object.freeze({
            _GetInputIsNotAny: 'Parameters<Adapter["getCurrent"]>[0]',
            _ArchiveInputIsNotAny: 'Parameters<Adapter["archive"]>[0]',
            _DeleteInputIsNotAny: 'Parameters<Adapter["delete"]>[0]',
            _RootGetInputIsNotAny: 'Parameters<RootAdapter["getCurrent"]>[0]',
            _RootArchiveInputIsNotAny: 'Parameters<RootAdapter["archive"]>[0]',
            _RootDeleteInputIsNotAny: 'Parameters<RootAdapter["delete"]>[0]',
        }),
    }),
});

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function validateCanonicalConsumerCastContract(contract) {
    const failures = [];
    const canonical = CANONICAL_CONSUMER_CAST_CONTRACT;
    if (contract?.schemaVersion !== canonical.schemaVersion)
        failures.push("schemaVersion must stay 2");
    const governance = contract?.requestCastGovernance;
    if (governance?.canonicalZeroBaseline !== true)
        failures.push("requestCastGovernance.canonicalZeroBaseline must stay true");
    if (!sameJson(governance?.sourceRoots, canonical.sourceRoots)) {
        failures.push("requestCastGovernance.sourceRoots must govern exactly cli/src and mcp/src");
    }
    if (
        governance?.exceptions == null ||
        !sameJson(
            Object.keys(governance.exceptions).sort(),
            [...canonical.exceptionPackages].sort(),
        )
    ) {
        failures.push("requestCastGovernance.exceptions must contain exactly cli and mcp arrays");
    }
    if (!sameJson(contract?.forbiddenRequestEscape, canonical.forbiddenRequestEscape)) {
        failures.push("forbiddenRequestEscape must equal the complete canonical roots and options");
    }
    if (!sameJson(contract?.publicNoAnyProof, canonical.publicNoAnyProof)) {
        failures.push("publicNoAnyProof must equal the canonical compiler-owned proof contract");
    }
    return failures;
}

export function validatePublicNoAnyProofSource(
    source,
    proof = CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof,
) {
    const failures = [];
    const sourceFile = ts.createSourceFile(
        proof.path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const assertions = new Map();
    const aliases = new Map();
    const importedTypes = new Map();
    const shadowedBuiltins = new Set();
    let isAnyDefinition = null;
    let assertFalseDefinition = null;
    const compact = (value) => value.replace(/\s+/g, "");
    for (const statement of sourceFile.statements) {
        if (
            !ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier) ||
            !statement.importClause
        ) {
            continue;
        }
        if (proof.requiredBuiltins?.includes(statement.importClause.name?.text)) {
            shadowedBuiltins.add(statement.importClause.name.text);
        }
        if (
            statement.importClause.namedBindings &&
            ts.isNamespaceImport(statement.importClause.namedBindings) &&
            proof.requiredBuiltins?.includes(statement.importClause.namedBindings.name.text)
        ) {
            shadowedBuiltins.add(statement.importClause.namedBindings.name.text);
        }
        if (
            !statement.importClause.namedBindings ||
            !ts.isNamedImports(statement.importClause.namedBindings)
        ) {
            continue;
        }
        for (const specifier of statement.importClause.namedBindings.elements) {
            if (proof.requiredBuiltins?.includes(specifier.name.text)) {
                shadowedBuiltins.add(specifier.name.text);
            }
            importedTypes.set(specifier.name.text, {
                importedName: (specifier.propertyName ?? specifier.name).text,
                module: statement.moduleSpecifier.text,
                typeOnly: statement.importClause.isTypeOnly || specifier.isTypeOnly,
            });
        }
    }
    for (const statement of sourceFile.statements) {
        if (
            statement.name &&
            ts.isIdentifier(statement.name) &&
            proof.requiredBuiltins?.includes(statement.name.text)
        ) {
            shadowedBuiltins.add(statement.name.text);
        }
        if (!ts.isTypeAliasDeclaration(statement)) continue;
        if (statement.name.text === "IsAny") {
            const parameter = statement.typeParameters?.[0];
            if (
                statement.typeParameters?.length === 1 &&
                parameter?.name.text === "T" &&
                !parameter.constraint &&
                !parameter.default
            ) {
                isAnyDefinition = compact(statement.type.getText(sourceFile));
            }
            continue;
        }
        if (statement.name.text === "AssertFalse") {
            const parameter = statement.typeParameters?.[0];
            if (
                statement.typeParameters?.length === 1 &&
                parameter?.name.text === "T" &&
                parameter.constraint &&
                !parameter.default &&
                statement.type.getText(sourceFile) === "T"
            ) {
                assertFalseDefinition = `${parameter.name.text}extends${compact(
                    parameter.constraint.getText(sourceFile),
                )}=${statement.type.getText(sourceFile)}`;
            }
            continue;
        }
        if (Object.hasOwn(proof.adapterAliases ?? {}, statement.name.text)) {
            aliases.set(statement.name.text, statement.type);
            continue;
        }
        const outer = statement.type;
        const inner = ts.isTypeReferenceNode(outer) ? outer.typeArguments?.[0] : null;
        const validShape =
            ts.isTypeReferenceNode(outer) &&
            outer.typeName.getText(sourceFile) === "AssertFalse" &&
            inner &&
            ts.isTypeReferenceNode(inner) &&
            inner.typeName.getText(sourceFile) === "IsAny" &&
            inner.typeArguments?.length === 1;
        assertions.set(
            statement.name.text,
            validShape ? compact(inner.typeArguments[0].getText(sourceFile)) : null,
        );
    }
    if (isAnyDefinition !== proof.isAnyDefinition) {
        failures.push("publicNoAnyProof IsAny definition is not canonical");
    }
    if (assertFalseDefinition !== proof.assertFalseDefinition) {
        failures.push("publicNoAnyProof AssertFalse definition is not canonical");
    }
    for (const builtin of proof.requiredBuiltins ?? []) {
        if (shadowedBuiltins.has(builtin)) {
            failures.push(
                `publicNoAnyProof must use the unshadowed TypeScript ${builtin} built-in`,
            );
        }
    }
    for (const [aliasName, expected] of Object.entries(proof.adapterAliases ?? {})) {
        const alias = aliases.get(aliasName);
        const validAlias =
            alias &&
            ts.isTypeReferenceNode(alias) &&
            ts.isIdentifier(alias.typeName) &&
            alias.typeName.text === expected.typeName &&
            (alias.typeArguments?.length ?? 0) === expected.typeArguments.length &&
            (alias.typeArguments ?? []).every(
                (argument, index) =>
                    compact(argument.getText(sourceFile)) ===
                    compact(expected.typeArguments[index]),
            );
        const imported = importedTypes.get(expected.typeName);
        const validImport =
            imported?.importedName === expected.importedName &&
            imported?.module === expected.module &&
            imported?.typeOnly === true;
        if (!validAlias || !validImport) {
            failures.push(
                `publicNoAnyProof ${aliasName} must resolve to imported ${expected.module} ${expected.importedName}<${expected.typeArguments.join(", ")}>`,
            );
        }
    }
    for (const marker of proof.contains) {
        const expectedOperand = compact(proof.operands?.[marker] ?? "");
        if (assertions.get(marker) !== expectedOperand) {
            failures.push(`publicNoAnyProof is missing compiler assertion type ${marker}`);
        }
    }
    return failures;
}

function makeTarget(makefile, target) {
    const lines = makefile.split("\n");
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const start = lines.findIndex((line) => new RegExp(`^${escaped}\\s*:`).test(line));
    if (start < 0) return null;
    const header = lines[start].replace(/\s+#.*$/, "");
    const separator = header.indexOf(":");
    const prerequisites = new Set(
        header
            .slice(separator + 1)
            .trim()
            .split(/\s+/)
            .filter(Boolean),
    );
    const recipes = new Set();
    for (let index = start + 1; index < lines.length; index += 1) {
        if (/^[A-Za-z0-9_.-]+\s*:/.test(lines[index])) break;
        if (!lines[index].startsWith("\t")) continue;
        const executable = lines[index]
            .slice(1)
            .trimStart()
            .replace(/^[@+-]+/, "")
            .trimStart();
        if (!executable || executable.startsWith("#")) continue;
        recipes.add(executable.replace(/\s+#.*$/, "").trimEnd());
    }
    return { prerequisites, recipes };
}

export function validateConsumerCastMakeWiring(
    makefile,
    proof = CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof,
    aggregateTarget = "consumer-cast-budget-run",
) {
    const failures = [];
    const target = makeTarget(makefile, proof.compilerGate);
    if (target == null)
        return [`publicNoAnyProof.compilerGate target ${proof.compilerGate} does not exist`];
    if (!target.prerequisites.has("sdk-wrapper-build")) {
        failures.push(`${proof.compilerGate} must depend on sdk-wrapper-build`);
    }
    const aggregate = makeTarget(makefile, aggregateTarget);
    if (aggregate == null) {
        failures.push(`aggregate execution target ${aggregateTarget} does not exist`);
        return failures;
    }
    const recursiveCommand = `$(MAKE) --no-print-directory ${aggregateTarget}`;
    if (!target.recipes.has(recursiveCommand)) {
        failures.push(`${proof.compilerGate} must execute ${recursiveCommand}`);
    }
    for (const command of [
        "node --test scripts/check-consumer-cast-budget.test.mjs",
        "node scripts/check-consumer-cast-budget.mjs",
        proof.compilerCommand,
    ]) {
        if (!aggregate.recipes.has(command))
            failures.push(`${aggregateTarget} must execute ${command}`);
    }
    return failures;
}
