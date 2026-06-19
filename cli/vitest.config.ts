import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        testTimeout: 30_000,
        environment: "node",
        coverage: {
            // Hand-written CLI surface under src/**. Thresholds are pinned to
            // the measured baseline in docs/coverage-contract.json.
            provider: "v8",
            reporter: ["text-summary", "json-summary"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.ts"],
            exclude: ["dist/**", "tests/**", "*.config.*"],
            // Mirror docs/coverage-contract.json (see the wrapper config for
            // the dual-authority rationale). Raised after the WS7 read-command
            // suites lifted measured CLI branches/statements above 80%.
            thresholds: {
                lines: 84,
                functions: 96,
                branches: 80,
                statements: 84,
            },
        },
    },
});
