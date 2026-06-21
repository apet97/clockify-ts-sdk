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
            // the dual-authority rationale). vitest 4's v8 (AST-aware) provider
            // counts functions/branches more granularly than v2; rather than
            // rebaseline down, new tool tests (approvals/audit/tags/customFields/
            // tasks/clients/sharedReports) lifted the honest v4 totals to
            // 87.26/85.95/67.72/83.17. Floors track that v4 baseline minus a
            // small margin.
            thresholds: {
                lines: 88,
                functions: 86,
                branches: 69,
                statements: 84,
            },
        },
    },
});
