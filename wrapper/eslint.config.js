// @ts-check
/**
 * ESLint flat config for the hand-written wrapper layer only.
 *
 * Scope: top-level *.ts (index.ts, create-client.ts, composed-fetch.ts,
 * iter.ts, pagination.ts, webhooks.ts, with-response.ts, errors.ts,
 * deprecation.ts), internal/** (routing, subdomain-label,
 * authenticated-boundary-fetch), plus tests/**.
 *
 * Excluded: src/** (locally generated, wiped on every `npm run sync` — any
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
            ".stryker-tmp/**",
            "docs/**",
            "examples/**",
            "scripts/**",
            "coverage/**",
            "eslint.config.js",
            "vitest.config.ts",
        ],
    },
    ...tseslint.configs.strictTypeChecked,
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
            // A single-use type parameter on a PUBLIC generic is a deliberate
            // caller-pinning affordance, not an accident: `constructEvent<MyPayload>()`
            // and `suggestOptions<MyRow>()` exist so a consumer can name the type.
            // The rule cannot tell that apart from a redundant parameter, and 1.0
            // freezes these signatures.
            "@typescript-eslint/no-unnecessary-type-parameters": "off",
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
        },
    },
    {
        // Every `if (Error.captureStackTrace)` in errors.ts is host-engine
        // feature detection. `@types/node` declares `captureStackTrace` as a
        // required member, so the rule reads the guard as always-truthy, but
        // the method is a V8 extension and is absent on other engines. The
        // guard is therefore necessary and the type is what over-promises.
        //
        // The guard shape is also load-bearing for mutation proof: errors.ts
        // measures 93.28 against a floor of 93, and the guard-to-false mutants
        // are documented V8-equivalent. Mutation score is measured only by the
        // GitHub Mutation workflow, so a local rewrite of these seven lines
        // could not be re-measured before release.
        files: ["errors.ts", "webhooks.ts"],
        rules: {
            "@typescript-eslint/no-unnecessary-condition": "off",
        },
    },
    {
        // Tests freely use `any`-flavored fixtures and mock fetchers that
        // are typed async but don't await. vitest catches floating
        // promises in describe/it bodies.
        //
        // The strictTypeChecked rules disabled below all pay for themselves in
        // production code and cost more than they return in a test: a wrong
        // `!` in an assertion fails the test loudly, which is the test's job,
        // and interpolating a fixture into a message needs no String() guard.
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
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-base-to-string": "off",
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
