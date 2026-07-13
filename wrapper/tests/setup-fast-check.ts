import fc from "fast-check";

// Mutation proof must not depend on which random seed a runner happened to pick.
// Keep the generated cases repeatable across local Node versions and GitHub jobs.
fc.configureGlobal({ seed: 20_260_713, numRuns: 100 });
