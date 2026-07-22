export function validateRequiredMakeStepGroups({ commands, expectedGroups, label }) {
    const failures = [];
    const actualGroups = commands
        .filter((entry) => entry?.command === "make" && Array.isArray(entry.args))
        .map((entry) => [...entry.args]);

    for (const [index, expected] of expectedGroups.entries()) {
        const actual = actualGroups[index] ?? [];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(
                `${label}[${index}] expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
            );
        }
    }
    return failures;
}
