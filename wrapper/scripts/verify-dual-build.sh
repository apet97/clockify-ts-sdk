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

SURFACE="ClockifyApiClient,createClockifyClient,composedFetch,iterAll,iterPages,paginate,paginatedList,PaginatedList,verifyClockifyWebhook,constructEvent,WebhookSignatureMismatchError,CLOCKIFY_WEBHOOK_EVENT_NAMES,ClockifyApiError,ClockifyApiTimeoutError,getRequestIdFromError,BadRequestError,UnauthorizedError,ForbiddenError,NotFoundError,MethodNotAllowedError,withResponse,RateLimitError,ConflictError,InternalServerError,ServiceUnavailableError,promoteApiError,classifyClockifyError,getStableErrorCode,isClockifyApiError,isRateLimitError,isConflictError,isInternalServerError,isServiceUnavailableError,CLOCKIFY_ERROR_CODES,errorCodeEntry,errorCodeForMessage,errorCodeForStatus,recoveryForCode,retryableForCode,warnOnce,Workspace,wrapResource,otelHooks,clockifyHealth,clockifyDiagnostics,getRateLimit,getRateLimitFromError"
EXPECTED_ROOT_SURFACE_COUNT=47

echo "==> ESM import smoke"
SURFACE="$SURFACE" EXPECTED_ROOT_SURFACE_COUNT="$EXPECTED_ROOT_SURFACE_COUNT" node --input-type=module -e "
import('./dist/esm/index.js').then(m => {
  const surface = process.env.SURFACE.split(',');
  const missing = surface.filter(name => typeof m[name] !== 'function' && typeof m[name] !== 'object');
  if (missing.length) {
    console.error('ESM missing exports:', missing);
    process.exit(1);
  }
  console.log('OK: ESM exposes', surface.length, 'expected names');
});
"

echo "==> CJS require smoke"
SURFACE="$SURFACE" EXPECTED_ROOT_SURFACE_COUNT="$EXPECTED_ROOT_SURFACE_COUNT" node -e "
const m = require('./dist/cjs/index.js');
const surface = process.env.SURFACE.split(',');
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
const er = require('./dist/cjs/errors.js');
const dp = require('./dist/cjs/deprecation.js');
if (typeof cf.composedFetch !== 'function') { console.error('CJS subpath composed-fetch broken'); process.exit(1); }
if (typeof cc.createClockifyClient !== 'function') { console.error('CJS subpath create-client broken'); process.exit(1); }
if (typeof it.iterAll !== 'function') { console.error('CJS subpath iter broken'); process.exit(1); }
if (typeof wh.verifyClockifyWebhook !== 'function') { console.error('CJS subpath webhooks broken'); process.exit(1); }
if (typeof pg.paginate !== 'function') { console.error('CJS subpath pagination broken'); process.exit(1); }
const pl = require('./dist/cjs/paginated-list.js');
if (typeof pl.paginatedList !== 'function') { console.error('CJS subpath paginated-list.paginatedList broken'); process.exit(1); }
if (typeof pl.PaginatedList !== 'function') { console.error('CJS subpath paginated-list.PaginatedList broken'); process.exit(1); }
if (typeof wr.withResponse !== 'function') { console.error('CJS subpath with-response broken'); process.exit(1); }
if (typeof er.RateLimitError !== 'function') { console.error('CJS subpath errors broken'); process.exit(1); }
if (typeof er.promoteApiError !== 'function') { console.error('CJS subpath errors.promoteApiError broken'); process.exit(1); }
if (typeof er.classifyClockifyError !== 'function') { console.error('CJS subpath errors.classifyClockifyError missing'); process.exit(1); }
if (typeof er.getStableErrorCode !== 'function') { console.error('CJS subpath errors.getStableErrorCode missing'); process.exit(1); }
if (!Array.isArray(er.CLOCKIFY_ERROR_CODES)) { console.error('CJS subpath errors.CLOCKIFY_ERROR_CODES missing'); process.exit(1); }
if (typeof er.errorCodeForStatus !== 'function') { console.error('CJS subpath errors.errorCodeForStatus missing'); process.exit(1); }
if (typeof dp.warnOnce !== 'function') { console.error('CJS subpath deprecation.warnOnce broken'); process.exit(1); }
const we = require('./dist/cjs/webhook-events.js');
if (!Array.isArray(we.CLOCKIFY_WEBHOOK_EVENT_NAMES)) { console.error('CJS subpath webhook-events.CLOCKIFY_WEBHOOK_EVENT_NAMES missing'); process.exit(1); }
if (we.CLOCKIFY_WEBHOOK_EVENT_NAMES.length !== 50) { console.error('CJS subpath webhook-events: expected 50 events, got', we.CLOCKIFY_WEBHOOK_EVENT_NAMES.length); process.exit(1); }
const sc = require('./dist/cjs/scoped-client.js');
if (typeof sc.Workspace !== 'function') { console.error('CJS subpath scoped-client.Workspace broken'); process.exit(1); }
if (typeof sc.wrapResource !== 'function') { console.error('CJS subpath scoped-client.wrapResource broken'); process.exit(1); }
const oh = require('./dist/cjs/otel-hooks.js');
if (typeof oh.otelHooks !== 'function') { console.error('CJS subpath otel-hooks.otelHooks broken'); process.exit(1); }
const hh = require('./dist/cjs/health.js');
if (typeof hh.clockifyHealth !== 'function') { console.error('CJS subpath health.clockifyHealth broken'); process.exit(1); }
const dg = require('./dist/cjs/diagnostics.js');
if (typeof dg.clockifyDiagnostics !== 'function') { console.error('CJS subpath diagnostics.clockifyDiagnostics broken'); process.exit(1); }
const rl = require('./dist/cjs/rate-limit.js');
if (typeof rl.getRateLimit !== 'function') { console.error('CJS subpath rate-limit.getRateLimit broken'); process.exit(1); }
if (typeof rl.getRateLimitFromError !== 'function') { console.error('CJS subpath rate-limit.getRateLimitFromError broken'); process.exit(1); }
console.log('OK: All 15 CJS subpaths resolve');
"

echo "==> Dual-build smoke PASSED"
