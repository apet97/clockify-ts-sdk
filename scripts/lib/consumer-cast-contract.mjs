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
    for (const statement of sourceFile.statements) {
        if (!ts.isTypeAliasDeclaration(statement)) continue;
        const outer = statement.type;
        const inner = ts.isTypeReferenceNode(outer) ? outer.typeArguments?.[0] : null;
        const validShape =
            ts.isTypeReferenceNode(outer) &&
            outer.typeName.getText(sourceFile) === "AssertFalse" &&
            inner &&
            ts.isTypeReferenceNode(inner) &&
            inner.typeName.getText(sourceFile) === "IsAny" &&
            inner.typeArguments?.length === 1;
        assertions.set(statement.name.text, Boolean(validShape));
    }
    for (const marker of proof.contains) {
        if (assertions.get(marker) !== true) {
            failures.push(`publicNoAnyProof is missing compiler assertion type ${marker}`);
        }
    }
    return failures;
}

function makeTargetBlock(makefile, target) {
    const lines = makefile.split("\n");
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const start = lines.findIndex((line) => new RegExp(`^${escaped}\\s*:`).test(line));
    if (start < 0) return null;
    const block = [lines[start]];
    for (let index = start + 1; index < lines.length; index += 1) {
        if (/^[A-Za-z0-9_.-]+\s*:/.test(lines[index])) break;
        block.push(lines[index]);
    }
    return block.join("\n");
}

export function validateConsumerCastMakeWiring(
    makefile,
    proof = CANONICAL_CONSUMER_CAST_CONTRACT.publicNoAnyProof,
) {
    const failures = [];
    const block = makeTargetBlock(makefile, proof.compilerGate);
    if (block == null)
        return [`publicNoAnyProof.compilerGate target ${proof.compilerGate} does not exist`];
    if (
        !new RegExp(`^${proof.compilerGate}\\s*:\\s*[^\n]*\\bsdk-wrapper-build\\b`, "m").test(block)
    ) {
        failures.push(`${proof.compilerGate} must depend on sdk-wrapper-build`);
    }
    for (const command of [
        "node --test scripts/check-consumer-cast-budget.test.mjs",
        "node scripts/check-consumer-cast-budget.mjs",
        proof.compilerCommand,
    ]) {
        if (!block.includes(command))
            failures.push(`${proof.compilerGate} must execute ${command}`);
    }
    return failures;
}
