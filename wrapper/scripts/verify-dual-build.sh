#!/usr/bin/env bash
# Smoke test: verify the built dist/ exposes the public surface
# in both ESM and CJS module systems. Run after `npm run build`;
# used as a CI gate to catch any divergence between the two outputs.

set -euo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WRAPPER_ROOT=$(cd -- "$HERE/.." && pwd)
cd "$WRAPPER_ROOT"

if [[ ! -d "dist/esm" || ! -d "dist/cjs" ]]; then
  echo "ERROR: dist/esm or dist/cjs missing. Run 'npm run build' first." >&2
  exit 1
fi

echo "==> ESM import smoke"
node --input-type=module -e "
import('./dist/esm/index.js').then(m => {
  const surface = ['ClockifyApiClient','createClockifyClient','composedFetch','iterAll','iterPages','paginate','verifyClockifyWebhook','constructEvent','WebhookSignatureMismatchError','ClockifyApiError','ClockifyApiTimeoutError','getRequestIdFromError','BadRequestError','UnauthorizedError','ForbiddenError','NotFoundError','MethodNotAllowedError','withResponse'];
  const missing = surface.filter(name => typeof m[name] !== 'function' && typeof m[name] !== 'object');
  if (missing.length) {
    console.error('ESM missing exports:', missing);
    process.exit(1);
  }
  console.log('OK: ESM exposes', surface.length, 'expected names');
});
"

echo "==> CJS require smoke"
node -e "
const m = require('./dist/cjs/index.js');
const surface = ['ClockifyApiClient','createClockifyClient','composedFetch','iterAll','iterPages','paginate','verifyClockifyWebhook','constructEvent','WebhookSignatureMismatchError','ClockifyApiError','ClockifyApiTimeoutError','getRequestIdFromError','BadRequestError','UnauthorizedError','ForbiddenError','NotFoundError','MethodNotAllowedError','withResponse'];
const missing = surface.filter(name => typeof m[name] !== 'function' && typeof m[name] !== 'object');
if (missing.length) {
  console.error('CJS missing exports:', missing);
  process.exit(1);
}
console.log('OK: CJS exposes', surface.length, 'expected names');
"

echo "==> CJS subpath smoke"
node -e "
const cf = require('./dist/cjs/composed-fetch.js');
const cc = require('./dist/cjs/create-client.js');
const it = require('./dist/cjs/iter.js');
const wh = require('./dist/cjs/webhooks.js');
const pg = require('./dist/cjs/pagination.js');
const wr = require('./dist/cjs/with-response.js');
if (typeof cf.composedFetch !== 'function') { console.error('CJS subpath composed-fetch broken'); process.exit(1); }
if (typeof cc.createClockifyClient !== 'function') { console.error('CJS subpath create-client broken'); process.exit(1); }
if (typeof it.iterAll !== 'function') { console.error('CJS subpath iter broken'); process.exit(1); }
if (typeof wh.verifyClockifyWebhook !== 'function') { console.error('CJS subpath webhooks broken'); process.exit(1); }
if (typeof pg.paginate !== 'function') { console.error('CJS subpath pagination broken'); process.exit(1); }
if (typeof wr.withResponse !== 'function') { console.error('CJS subpath with-response broken'); process.exit(1); }
console.log('OK: All 6 CJS subpaths resolve');
"

echo "==> Dual-build smoke PASSED"
