// V6: shared, unit-testable core of generate-operation-parity.mjs's
// candidate MCP tool name inference. resourceAliases and methodAliases each
// paper over one gap between an operation's raw SDK resource/method name and
// the tool-naming convention actually used in mcp/src/tools -- resourceAliases
// renames a generated SDK group to the tool-name group it is surfaced under
// (e.g. "time_entries" operations are tools named "clockify_entries_..."),
// and methodAliases adds extra candidate method suffixes for a method whose
// generated name does not match its tool verb (e.g. a "submit" SDK method is
// also tried as "create"). candidateTools() combines both into the full
// "clockify_<group>_<method>" guesses generate-operation-parity.mjs's build()
// checks against the real tool manifests.
//
// Exported separately from generate-operation-parity.mjs (which has
// unconditional top-level file reads at import time) so both maps are
// unit-testable against real inventory/manifest data without staging this
// generator's full input set. See generate-operation-parity.test.mjs's
// "alias maps are bound in both directions" tests: every key here must be
// reachable from at least one real operation (a key nothing reaches is dead
// code left over from a rename), and every alias must be able to produce at
// least one candidate name that exists in the real tool manifest (an alias
// pointing nowhere is either wrong or stale).
// V6: three entries were removed here, all confirmed dead by the "every
// resourceAliases target produces a candidate tool name that exists in the
// real manifest" test below before removal:
//   - "custom_fields" -> "custom_fields" and "time_off_policies" ->
//     "time_off_policies" were self-mapping no-ops -- a resourceAliases
//     entry whose target equals its key changes nothing (candidateTools()
//     already falls back to the raw group when the map has no entry).
//   - "time_off" -> "time_off" was an active mismatch, not a no-op: the real
//     tools for Time-Off-tagged operations are clockify_time_off_requests_*,
//     not clockify_time_off_*. A correct fix needs a matching methodAliases
//     rework for the time-off verbs (createTimeOffRequest -> submit, etc.),
//     which is out of this item's scope; removing the wrong collapse is the
//     safe, scope-respecting step -- it does not regress anything because
//     candidateTools()'s fallback (the raw "time_off" group) matched exactly
//     as little as the removed alias did.
//   All 18 operations these three entries touched (7 custom-fields, 6
//   time-off-policy, 5 time-off-request) are resolved entirely through
//   explicit docs/operation-parity-overrides.json entries, so none of this
//   changes any operation's actual tsMcp/goMcp resolution.
export const resourceAliases = new Map([
    ["time_entries", "entries"],
    ["audit_log_report", "audit_log"],
    ["user_groups", "groups"],
    ["expense_categories", "expenses"],
    ["expense_report", "expenses"],
    ["invoice_items", "invoices"],
    ["invoice_payments", "invoices"],
]);

// Each conditional branch is one bound alias; the literal string compared
// against `snake` is the alias's key (methodAliasKeys below), and `.add(...)`
// is its target.
//
// V6: "find_workspace_users" was removed here -- no real operation's SDK
// method snake-cases to that exact string. The one operation it looks like it
// was meant for, filterWorkspaceUsers, snake-cases to "filter_workspace_users"
// (which the separate "filter" branch already covers) and is resolved
// entirely through an explicit docs/operation-parity-overrides.json entry
// (tsMcp: clockify_groups_list_members) regardless. Confirmed unreachable by
// the "every methodAliases key is reachable from a real operation's SDK
// method" test below before removal.
export function methodAliases(snake) {
    const aliases = new Set([snake]);
    if (snake === "filter") aliases.add("list");
    if (snake === "generate_detailed_report_v1") aliases.add("list");
    if (snake === "submit") aliases.add("create");
    if (snake === "update_status") aliases.add("update_status");
    if (snake === "list_in_progress") aliases.add("list");
    return [...aliases];
}

// The literal keys methodAliases branches on, kept as a single source so a
// test can enumerate them without re-parsing the function body.
export const methodAliasKeys = [
    "filter",
    "generate_detailed_report_v1",
    "submit",
    "update_status",
    "list_in_progress",
];

export function toSnake(value) {
    return String(value ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

export function rawGroupFor(op) {
    return toSnake(op.sdkGroup || op.tags?.[0] || "");
}

export function methodSourceFor(op) {
    return op.sdkMethod || op.operationId || op.method.toLowerCase();
}

export function candidateTools(op) {
    const rawGroup = rawGroupFor(op);
    const group = resourceAliases.get(rawGroup) ?? rawGroup;
    const methodSnake = toSnake(methodSourceFor(op));
    return methodAliases(methodSnake).map((method) => `clockify_${group}_${method}`);
}
