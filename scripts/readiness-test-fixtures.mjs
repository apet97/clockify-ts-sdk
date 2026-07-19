// Test-only fixture seam for readiness validators. Production entrypoints use
// their tracked docs unless a test explicitly opts into temporary fixtures.
import { tmpdir } from "node:os";
import path from "node:path";

const TEST_FIXTURE_FLAG = "--test-readiness-fixtures";

function temporaryFixturePath(value, label) {
    const absolutePath = path.resolve(value ?? "");
    const relativeToTemp = path.relative(tmpdir(), absolutePath);
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        relativeToTemp === "" ||
        relativeToTemp === ".." ||
        relativeToTemp.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeToTemp)
    ) {
        throw new Error(`${label} must be an absolute fixture path under ${tmpdir()}`);
    }
    return absolutePath;
}

export function resolveReadinessTestFixtures({
    argv = process.argv.slice(2),
    canonicalRiskRegisterPath,
    canonicalReleaseContractPath,
}) {
    if (argv.length === 0) {
        return {
            riskRegisterPath: canonicalRiskRegisterPath,
            releaseContractPath: canonicalReleaseContractPath,
        };
    }
    if (process.env.NODE_ENV !== "test" || argv.length !== 3 || argv[0] !== TEST_FIXTURE_FLAG) {
        throw new Error(
            `readiness validators accept only ${TEST_FIXTURE_FLAG} <risk-register> <release-contract> under NODE_ENV=test`,
        );
    }
    return {
        riskRegisterPath: temporaryFixturePath(argv[1], "risk-register"),
        releaseContractPath: temporaryFixturePath(argv[2], "release-contract"),
    };
}
