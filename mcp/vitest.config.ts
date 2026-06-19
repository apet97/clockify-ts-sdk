import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        testTimeout: 30_000,
        environment: "node",
        coverage: {
            // Hand-written MCP surface under src/**. Thresholds are pinned to
            // the measured baseline in docs/coverage-contract.json.
            provider: "v8",
            reporter: ["text-summary", "json-summary"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.ts"],
            exclude: ["dist/**", "tests/**", "*.config.*"],
            // Mirror docs/coverage-contract.json (see the wrapper config for
            // the dual-authority rationale).
            thresholds: {
                lines: 79,
                functions: 91,
                branches: 74,
                statements: 79,
            },
        },
    },
});
