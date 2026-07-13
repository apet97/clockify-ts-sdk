// Stryker's Vitest runner currently executes only the first explicit test file
// in this workspace. Keep one governed entrypoint so every safety-critical
// mutation suite participates in the dry run and per-test coverage map.
import "./confirmation-store.test.js";
import "./result.test.js";
import "./tool-registration.test.js";
import "./tool-risk.test.js";
