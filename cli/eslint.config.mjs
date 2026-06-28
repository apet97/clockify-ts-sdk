// @ts-check
/**
 * ESLint flat config for the @apet97/clockify-cli-115 hand-written surface
 * (src/** plus tests/**). Type-aware rules use a dedicated
 * `project: ["./tsconfig.lint.json"]` (which includes tests/**). dist/,
 * node_modules/, and scripts/ are excluded.
 */
import importPlugin from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            ".stryker-tmp/**",
            "coverage/**",
            "scripts/**",
            "eslint.config.mjs",
            "vitest.config.ts",
        ],
    },
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.lint.json"],
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
            // The CLI marshals loosely-typed Clockify API responses for display;
            // the unsafe-* family floods on that legitimate `unknown` handling,
            // and command handlers are async by interface. The higher-value
            // rules (no-base-to-string, restrict-template-expressions, import
            // order, consistent-type-imports) stay on.
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/require-await": "off",
        },
    },
    {
        files: ["tests/**/*.ts"],
        rules: {
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/no-base-to-string": "off",
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/require-await": "off",
        },
    },
];
