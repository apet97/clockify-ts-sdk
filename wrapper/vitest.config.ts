import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        include: ["tests/**/*.test.ts"],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        // Type tests live in tests/types/*.test-d.ts and run on demand
        // via `npm run test:types` (`vitest --typecheck.only`). Default
        // `npm test` skips them — `enabled: false` matches vitest's
        // default and is repeated here for clarity.
        typecheck: {
            enabled: false,
            tsconfig: "./tsconfig.json",
            include: ["tests/types/**/*.test-d.ts"],
        },
    },
});
