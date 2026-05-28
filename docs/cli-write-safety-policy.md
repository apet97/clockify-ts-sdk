# CLI Write Safety Policy

The CLI is a scriptable operator surface. It must not surprise users
with hidden prompts, implicit workspace changes, or vague success
messages. Safety comes from explicit arguments, stable JSON, clear exit
codes, and receipts that can be logged by automation.

## Rules

1. CLI writes stay non-interactive.

   Do not add prompt-only confirmation to write commands. Shell scripts,
   CI probes, and local operators need deterministic exits. If a future
   command needs a confirmation guard, it should be an explicit flag or
   dry-run option, not a blocking prompt.

2. Destructive commands must be ID-scoped.

   Delete/remove commands must require an explicit `<id>` argument and
   print a success receipt naming the deleted resource. No destructive
   command may infer a target from a name search alone.

3. Create commands must return identifiers.

   Creation commands must print at least the new object ID in JSON mode
   and a concise human-readable receipt otherwise.

4. High-risk writes need wording in the README.

   Invoice, scheduling, webhook, time-off, timer, and delete commands
   must be visible in `cli/README.md` so users can review side effects
   before running them.

5. Errors must stay machine-readable.

   `--json` errors must include stable error codes and recovery hints.
   Usage errors must keep the documented exit-code contract.
## Required proof

- `make cli-write-safety` checks the contract in this file.
- `make cli-contract` checks command metadata, globals, completion
  shells, binaries, and exit codes.
- `make perfect-fast` and `make perfect-full` include both gates.
