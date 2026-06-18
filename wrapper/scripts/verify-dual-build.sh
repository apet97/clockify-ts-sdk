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

SURFACE="ClockifyApiClient,createClockifyClient,composedFetch,iterAll,iterPages,paginate,paginatedList,PaginatedList,verifyClockifyWebhook,constructEvent,WebhookSignatureMismatchError,CLOCKIFY_WEBHOOK_EVENT_NAMES,ClockifyApiError,ClockifyApiTimeoutError,getRequestIdFromError,BadRequestError,UnauthorizedError,ForbiddenError,NotFoundError,MethodNotAllowedError,withResponse,RateLimitError,ConflictError,InternalServerError,ServiceUnavailableError,AddonTokenRestrictionError,promoteApiError,classifyClockifyError,getStableErrorCode,isClockifyApiError,isRateLimitError,isConflictError,isInternalServerError,isServiceUnavailableError,mapAddonTokenRestriction,CLOCKIFY_ERROR_CODES,errorCodeEntry,errorCodeForMessage,errorCodeForStatus,recoveryForCode,retryableForCode,warnOnce,Workspace,wrapResource,otelHooks,clockifyHealth,clockifyDiagnostics,getRateLimit,getRateLimitFromError,requestOptions,withHeaders,withIdempotencyKey,withRequestTimeout,toOperationReceipt,toOperationErrorReceipt,toMinor,toMajor,invoiceItemUnitPriceToWire,invoiceItemUnitPriceFromWire,CLOCKIFY_AMOUNT_UNITS,invoiceUpdateBodyFromExisting,INVOICE_EDITABLE_FIELDS,INVOICE_PERCENT_FIELD_MAP,resolveRelativeDay,resolveInstant,resolvePeriod,REPORT_PERIODS,looksLikeClockifyId,matchByName,suggestOptions,resolveEntityRef,resolveProjectTaskRefs,resolveUserRef,resolveUserRefs,resolveGroupRefs,resolveTagRefs,resolveUserFilter,ensureTag,ensureProject,ensureClient,archiveThenDeleteProject,summaryFilter,detailedFilter,weeklyFilter,detailedEntries,summaryGroups,reportTotals,mapBounded,bulkArchiveProjects,bulkDelete,runComposition,leftBehindNote,wireBody"
EXPECTED_ROOT_SURFACE_COUNT=93

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
SUBPATH_COUNT=$(grep -cE "require\('\\./dist/cjs/" "$0")
export SUBPATH_COUNT
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
const ro = require('./dist/cjs/request-options.js');
if (typeof ro.requestOptions !== 'function') { console.error('CJS subpath request-options.requestOptions broken'); process.exit(1); }
if (typeof ro.withHeaders !== 'function') { console.error('CJS subpath request-options.withHeaders broken'); process.exit(1); }
if (typeof ro.withIdempotencyKey !== 'function') { console.error('CJS subpath request-options.withIdempotencyKey broken'); process.exit(1); }
if (typeof ro.withRequestTimeout !== 'function') { console.error('CJS subpath request-options.withRequestTimeout broken'); process.exit(1); }
const or = require('./dist/cjs/operation-receipt.js');
if (typeof or.toOperationReceipt !== 'function') { console.error('CJS subpath operation-receipt.toOperationReceipt broken'); process.exit(1); }
if (typeof or.toOperationErrorReceipt !== 'function') { console.error('CJS subpath operation-receipt.toOperationErrorReceipt broken'); process.exit(1); }
const mn = require('./dist/cjs/money.js');
if (typeof mn.toMinor !== 'function') { console.error('CJS subpath money.toMinor broken'); process.exit(1); }
if (typeof mn.toMajor !== 'function') { console.error('CJS subpath money.toMajor broken'); process.exit(1); }
const ib = require('./dist/cjs/invoice-body.js');
if (typeof ib.invoiceUpdateBodyFromExisting !== 'function') { console.error('CJS subpath invoice-body.invoiceUpdateBodyFromExisting broken'); process.exit(1); }
const dt = require('./dist/cjs/dates.js');
if (typeof dt.resolveRelativeDay !== 'function') { console.error('CJS subpath dates.resolveRelativeDay broken'); process.exit(1); }
if (typeof dt.resolvePeriod !== 'function') { console.error('CJS subpath dates.resolvePeriod broken'); process.exit(1); }
const rs = require('./dist/cjs/resolve.js');
if (typeof rs.resolveEntityRef !== 'function') { console.error('CJS subpath resolve.resolveEntityRef broken'); process.exit(1); }
if (typeof rs.matchByName !== 'function') { console.error('CJS subpath resolve.matchByName broken'); process.exit(1); }
const en = require('./dist/cjs/ensure.js');
if (typeof en.ensureTag !== 'function') { console.error('CJS subpath ensure.ensureTag broken'); process.exit(1); }
if (typeof en.findOrCreateClient !== 'function') { console.error('CJS subpath ensure.findOrCreateClient broken'); process.exit(1); }
if (typeof en.archiveThenDeleteProject !== 'function') { console.error('CJS subpath ensure.archiveThenDeleteProject broken'); process.exit(1); }
const rq = require('./dist/cjs/requests.js');
if (typeof rq.wireBody !== 'function') { console.error('CJS subpath requests.wireBody broken'); process.exit(1); }
const rep = require('./dist/cjs/reports.js');
if (typeof rep.summaryFilter !== 'function') { console.error('CJS subpath reports.summaryFilter broken'); process.exit(1); }
if (typeof rep.detailedEntries !== 'function') { console.error('CJS subpath reports.detailedEntries broken'); process.exit(1); }
const bk = require('./dist/cjs/bulk.js');
if (typeof bk.mapBounded !== 'function') { console.error('CJS subpath bulk.mapBounded broken'); process.exit(1); }
if (typeof bk.bulkArchiveProjects !== 'function') { console.error('CJS subpath bulk.bulkArchiveProjects broken'); process.exit(1); }
const cmp = require('./dist/cjs/compose.js');
if (typeof cmp.runComposition !== 'function') { console.error('CJS subpath compose.runComposition broken'); process.exit(1); }
if (typeof cmp.leftBehindNote !== 'function') { console.error('CJS subpath compose.leftBehindNote broken'); process.exit(1); }
console.log('OK: All ' + process.env.SUBPATH_COUNT + ' CJS subpaths resolve');
"

echo "==> Dual-build smoke PASSED"
