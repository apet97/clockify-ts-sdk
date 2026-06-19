# Snippet Compile Policy

README code fences can opt into compile-backed drift protection by adding
`sdk-include=<file>` to a `ts` or `typescript` fence. The file name is resolved
relative to the surface's configured examples directory in
[`snippet-compile-contract.json`](./snippet-compile-contract.json).

Tagged fences must be byte-exact contiguous slices of their curated example
file after trimming leading and trailing blank lines. The examples are already
compiled by `npm run type-check -w clockify-sdk-ts-115`, so a tagged README
snippet inherits the same method-name, import, and argument-shape checks without
building a second TypeScript harness for prose snippets.

Untagged README fences remain covered by `make snippet-method-parity` and
`make snippet-safety`: generated-client method references must exist and snippets
must avoid secrets, generated internals, and unsafe live defaults. They are not
compile-pinned until a maintainer copies them from a curated example and tags the
fence.

When a tagged snippet needs to change, update the example first, run the wrapper
type-check, then copy the exact slice back into the README fence.
