#!/usr/bin/env bash
# Write dist/cjs/package.json with { "type": "commonjs" } so Node
# treats the .js files under dist/cjs/ as CJS regardless of the
# parent package.json's `"type": "module"`. Run after the CJS tsc
# pass; idempotent.

set -euo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WRAPPER_ROOT=$(cd -- "$HERE/.." && pwd)
CJS_DIR="${WRAPPER_ROOT}/dist/cjs"

if [[ ! -d "$CJS_DIR" ]]; then
  echo "ERROR: $CJS_DIR not found. Run 'tsc -p tsconfig.cjs.json' first." >&2
  exit 1
fi

cat > "${CJS_DIR}/package.json" <<'EOF'
{
  "type": "commonjs"
}
EOF

echo "Wrote ${CJS_DIR}/package.json (type: commonjs)"
