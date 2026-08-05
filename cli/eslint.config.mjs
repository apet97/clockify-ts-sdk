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
    ...tseslint.configs.strictTypeChecked,
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
            // strictTypeChecked defaults restrict-template-expressions to
            // allowNumber:false. Interpolating a number into a message is
            // idiomatic and cannot throw or stringify to "[object Object]",
            // so the rule keeps its value against unknown/objects only.
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            // All three packages run noUncheckedIndexedAccess, which types every
            // array index as `T | undefined`. `!` is the language's designated
            // way to discharge a bounds invariant the compiler cannot see, and
            // it emits nothing. Enforcing no-non-null-assertion on top of that
            // flag would trade erased assertions for dead runtime branches --
            // including inside webhook-url.ts, whose SSRF checks Stryker scores
            // against a pinned floor. strict plus noUncheckedIndexedAccess carry
            // the safety this rule is meant to add.
            "@typescript-eslint/no-non-null-assertion": "off",
            // Disabled on evidence, not preference: this rule's autofix rewrote
            // three `x !== true` guards in wrapper/internal/routing.ts to `!x`
            // during this upgrade, which silently widened them to accept truthy
            // non-booleans such as 1 or "yes" -- the exact plain-JS input that
            // validator exists to reject. Every place it fires here, the value
            // crosses a JS-caller or wire boundary where the boolean type is a
            // promise the runtime does not keep.
            "@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
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
        // The strictTypeChecked rules disabled below all pay for themselves in
        // production code and cost more than they return in a test: a wrong
        // `!` in an assertion fails the test loudly, which is the test's job,
        // and a void-returning arrow shorthand in a mock is not confusing.
        files: ["tests/**/*.ts"],
        rules: {
            // A test exists to probe states the types call impossible and to keep
            // deprecated surface working, so these three read as noise there.
            "@typescript-eslint/no-deprecated": "off",
            "@typescript-eslint/no-unnecessary-condition": "off",
            "@typescript-eslint/no-invalid-void-type": "off",
            "@typescript-eslint/no-unnecessary-type-conversion": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-confusing-void-expression": "off",
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
