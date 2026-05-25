// @ts-check
/**
 * ESLint flat config for the hand-written wrapper layer only.
 *
 * Scope: top-level *.ts (index.ts, create-client.ts, composed-fetch.ts,
 * iter.ts, pagination.ts, webhooks.ts, with-response.ts, errors.ts,
 * deprecation.ts) plus tests/**.
 *
 * Excluded: src/** (Fern-generated, wiped on every `npm run sync` — any
 * lint findings would be churn), dist/**, examples/** (standalone
 * snippets, not part of the build), scripts/**, docs/**.
 *
 * Type-aware rules use `projectService: true` so tsconfig.json is
 * auto-discovered (no static `project` path or `tsconfigRootDir` needed).
 */
import importPlugin from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "src/**",
            "dist/**",
            "node_modules/**",
            "docs/**",
            "examples/**",
            "scripts/**",
            "coverage/**",
            "eslint.config.js",
            "vitest.config.ts",
        ],
    },
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        plugins: {
            "import-x": importPlugin,
        },
        rules: {
            "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "import-x/order": [
                "error",
                {
                    groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
                    "newlines-between": "always",
                    alphabetize: { order: "asc", caseInsensitive: true },
                },
            ],
            "import-x/no-cycle": "error",
        },
    },
    {
        // Tests freely use `any`-flavored fixtures and mock fetchers that
        // are typed async but don't await. vitest catches floating
        // promises in describe/it bodies.
        files: ["tests/**/*.ts"],
        rules: {
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/require-await": "off",
        },
    },
];
