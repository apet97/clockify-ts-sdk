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
            // the dual-authority rationale). vitest 4's v8 (AST-aware) provider
            // counts functions/branches more granularly than v2; rather than
            // rebaseline down, new command tests (timeoff/entries/invoices)
            // lifted the honest v4 totals to 90.55/88.01/80.37/88.76 — lines &
            // statements now exceed the old v2 floors. Floors track that v4
            // baseline minus a small margin.
            thresholds: {
                lines: 90,
                functions: 87,
                branches: 79,
                statements: 88,
            },
        },
    },
});
