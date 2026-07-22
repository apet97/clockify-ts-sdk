const CODEGEN_COMMANDS = [
    { command: "make", args: ["sdk-codegen"] },
    {
        command: "make",
        args: ["sdk-codegen-drift", "sdk-codegen-test", "generated-edit-check"],
        env: { CLOCKIFY_ALLOW_GENERATED_DIFF: "1" },
    },
];

const PACKAGE_COMMANDS = [
    { command: "npm", args: ["run", "build", "-w", "clockify-sdk-ts-115"] },
    { command: "npm", args: ["run", "lint", "-w", "clockify-sdk-ts-115"] },
    { command: "npm", args: ["run", "lint", "-w", "@apet97/clockify-cli-115"] },
    { command: "npm", args: ["run", "lint", "-w", "@apet97/clockify-mcp-115"] },
    { command: "npm", args: ["run", "type-check"] },
    { command: "npm", args: ["test"] },
    { command: "npm", args: ["run", "build"] },
    { command: "make", args: ["pack-snapshot-check"] },
    { command: "node", args: ["--test", "scripts/check-npm-audit.test.mjs"] },
    { command: "node", args: ["scripts/check-npm-audit.mjs"] },
];

const GENERATOR_COMPARISON = { command: "make", args: ["generator-comparison"] };
const PERFORMANCE_BUDGETS = { command: "make", args: ["performance-budgets"] };
const GENERATED_CONTRACT_COMMANDS = [
    { command: "make", args: ["mcp-tool-manifest-drift-run"] },
    { command: "make", args: ["mcp-write-safety-run"] },
];

const FULL_COMMANDS = [
    { command: "make", args: ["goclmcp-drift"] },
    { command: "make", args: ["spec-sync-drift"] },
    { command: "make", args: ["codegen-determinism"] },
    { command: "make", args: ["build-determinism"] },
    { command: "make", args: ["pack-smoke"] },
    { command: "make", args: ["coverage-run"] },
    { command: "make", args: ["mutation-ci"] },
];

const RELEASE_COMMANDS = [
    { command: "npm", args: ["audit"] },
    { command: "make", args: ["mcpb", "mcpb-validate", "mcpb-smoke"] },
    { command: "make", args: ["version-consistency", "tag-hygiene", "secret-hygiene"] },
];

const LIVE_COMMAND = {
    command: "make",
    args: ["perfect-live"],
    inheritLiveEnvironment: true,
};

function cloneCommands(commands) {
    return commands.map((entry) => ({
        command: entry.command,
        args: [...entry.args],
        ...(entry.env === undefined ? {} : { env: { ...entry.env } }),
        ...(entry.inheritLiveEnvironment === undefined
            ? {}
            : { inheritLiveEnvironment: entry.inheritLiveEnvironment }),
    }));
}

/**
 * Canonical command authority consumed directly by the production runner and
 * structural contract checkers. Fast/full keep the load-sensitive performance
 * gate fatal, unique, and last. Live/release retain their standalone command
 * sets without being governed by that ordering rule.
 */
export function commandsForPhase(phase) {
    const common = [
        ...CODEGEN_COMMANDS,
        GENERATOR_COMPARISON,
        ...PACKAGE_COMMANDS.slice(0, 7),
        ...GENERATED_CONTRACT_COMMANDS,
        ...PACKAGE_COMMANDS.slice(7),
    ];
    let commands;
    switch (phase) {
        case "fast":
            commands = [...common, PERFORMANCE_BUDGETS];
            break;
        case "full":
            commands = [...common, ...FULL_COMMANDS, PERFORMANCE_BUDGETS];
            break;
        case "live":
            commands = [
                ...CODEGEN_COMMANDS,
                ...PACKAGE_COMMANDS.slice(0, 8),
                PERFORMANCE_BUDGETS,
                ...PACKAGE_COMMANDS.slice(8),
                LIVE_COMMAND,
            ];
            break;
        case "release":
            commands = [
                ...common,
                PERFORMANCE_BUDGETS,
                ...FULL_COMMANDS,
                ...RELEASE_COMMANDS,
            ];
            break;
        default:
            throw new Error(`unsupported verify phase: ${phase}`);
    }
    return cloneCommands(commands);
}

export function makeStepGroupsForPhase(phase) {
    return commandsForPhase(phase)
        .filter((entry) => entry.command === "make")
        .map((entry) => [...entry.args]);
}

export const VERIFY_PHASES = Object.freeze(["fast", "full", "live", "release"]);
