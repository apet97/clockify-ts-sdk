const PASSING_STATUSES = new Set(["Killed", "Timeout"]);
const EXCLUDED_STATUSES = new Set(["Ignored", "NoCoverage"]);

export function coveredMutationScore(mutants) {
    const included = mutants.filter((mutant) => !EXCLUDED_STATUSES.has(mutant?.status));
    if (included.length === 0) {
        throw new Error("zero covered mutants; refusing to treat an unmeasured module as 100%");
    }
    const killed = included.filter((mutant) => PASSING_STATUSES.has(mutant?.status)).length;
    return (100 * killed) / included.length;
}
