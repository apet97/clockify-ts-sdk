#!/usr/bin/env bash
# Sync the generated TS SDK from ../output/ts-sdk/ into ./src/.
#
# The local generator overwrites the entire output/ts-sdk/ tree on every regen, so any
# package metadata (package.json, tsconfig*.json, node_modules, etc.)
# placed there gets wiped. The wrapper/ layout keeps the package
# metadata in this directory and pulls the generator output into src/
# at publish time. Re-run after every `make sdk-codegen`, and before
# `npm run build` / `npm publish`.

set -euo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WRAPPER_ROOT=$(cd -- "$HERE/.." && pwd)
SDK_OUT="${WRAPPER_ROOT}/../output/ts-sdk"

if [[ ! -d "$SDK_OUT" ]]; then
  echo "ERROR: generated SDK output not found at $SDK_OUT" >&2
  echo "Run: make sdk-codegen" >&2
  exit 1
fi

# Wipe and repopulate src/.
rm -rf "$WRAPPER_ROOT/src"
mkdir -p "$WRAPPER_ROOT/src"

# Copy everything from output/ts-sdk except local smoke-test artifacts
# (package.json + tsconfig*.json + node_modules + lockfiles), which the
# wrapper provides its own copies of.
rsync -a \
  --exclude='node_modules/' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='pnpm-lock.yaml' \
  --exclude='yarn.lock' \
  --exclude='tsconfig.json' \
  --exclude='tsconfig.*.json' \
  --exclude='codegen-receipt.json' \
  --exclude='.npmignore' \
  --exclude='.gitignore' \
  --exclude='.git/' \
  "$SDK_OUT/" "$WRAPPER_ROOT/src/"

ts_count=$(find "$WRAPPER_ROOT/src" -name '*.ts' | wc -l | tr -d ' ')
echo "Synced ${ts_count} TypeScript files from ${SDK_OUT} -> ${WRAPPER_ROOT}/src/"

# Regenerate per-resource markdown reference so PR diffs surface any
# shape drift in the synced SDK. Idempotent; output committed under
# wrapper/docs/resources/.
echo "Regenerating per-resource docs..."
(cd "$WRAPPER_ROOT" && npx tsx scripts/gen-resource-docs.ts)
