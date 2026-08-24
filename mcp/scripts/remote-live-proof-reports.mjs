import { requireToolSuccess } from "./remote-live-proof-support.mjs";

const REPORT_MODEL_KEY = "io.github.apet97.clockify115/reports-dashboard";
const REPORT_MODEL_LIMIT = 64 * 1024;

export async function proveReports({
    call,
    token,
    isReportsAppModel,
    marker,
    dayStart,
    dayEnd,
    attendanceDayEnd,
    weekStart,
    weekEnd,
}) {
    const requests = [
        [
            "clockify_reports_summary",
            {
                dateRangeStart: dayStart,
                dateRangeEnd: dayEnd,
                summaryFilter: { groups: ["PROJECT"] },
                extra: { description: marker, timeZone: "UTC" },
            },
        ],
        [
            "clockify_reports_detailed",
            {
                dateRangeStart: dayStart,
                dateRangeEnd: dayEnd,
                detailedFilter: { page: 1, pageSize: 50 },
                extra: { description: marker, timeZone: "UTC" },
            },
        ],
        [
            "clockify_reports_weekly",
            {
                dateRangeStart: weekStart,
                dateRangeEnd: weekEnd,
                weeklyFilter: { group: "PROJECT", subgroup: "TIME" },
                extra: { description: marker, timeZone: "UTC" },
            },
        ],
        [
            "clockify_reports_attendance",
            {
                dateRangeStart: dayStart,
                dateRangeEnd: attendanceDayEnd,
                attendanceFilter: { page: 1, pageSize: 50 },
                extra: { timeZone: "UTC" },
            },
        ],
        [
            "clockify_reports_expense",
            {
                dateRangeStart: dayStart,
                dateRangeEnd: dayEnd,
                page: 1,
                pageSize: 50,
                extra: { timeZone: "UTC" },
            },
        ],
    ];
    let appModels = 0;
    let unavailable = 0;
    let markerReports = 0;
    for (const [name, args] of requests) {
        const result = await call(token, name, args);
        const outcome = validateReportResult(result, name, args, isReportsAppModel, marker);
        if (outcome.unavailable) {
            unavailable += 1;
            continue;
        }
        appModels += 1;
        if (outcome.marker) markerReports += 1;
    }
    if (appModels + unavailable !== 5) throw new Error("report acceptance count drifted");
    for (let attempt = 0; markerReports === 0 && attempt < 5; attempt += 1) {
        await delay(1_500);
        for (const [name, args] of requests.slice(0, 2)) {
            const retry = validateReportResult(
                await call(token, name, args),
                name,
                args,
                isReportsAppModel,
                marker,
            );
            if (retry.marker) {
                markerReports = 1;
                break;
            }
        }
    }
    if (markerReports === 0) throw new Error("available report data omitted the seeded marker");
    return { appModels, featureUnavailable: unavailable, markerReports };
}

function validateReportResult(result, name, args, isReportsAppModel, marker) {
    if (isFeatureUnavailable(result)) return { unavailable: true, marker: false };
    requireToolSuccess(result, name);
    const model = result._meta?.[REPORT_MODEL_KEY];
    if (
        typeof isReportsAppModel !== "function" ||
        !isReportsAppModel(model) ||
        Buffer.byteLength(JSON.stringify(model), "utf8") > REPORT_MODEL_LIMIT
    ) {
        throw new Error("report returned no valid bounded App model");
    }
    if (
        model.sourceTool !== name ||
        model.query.dateRangeStart !== args.dateRangeStart ||
        model.query.dateRangeEnd !== args.dateRangeEnd ||
        model.query.timeZone !== "UTC"
    ) {
        throw new Error("report App model changed the requested time boundary");
    }
    return {
        unavailable: false,
        marker: containsExactString(result.structuredContent?.data, marker),
    };
}

function isFeatureUnavailable(result) {
    return (
        isRecord(result) &&
        result.isError === true &&
        isRecord(result.structuredContent) &&
        isRecord(result.structuredContent.error) &&
        result.structuredContent.error.code === "feature_unavailable" &&
        isRecord(result.structuredContent.recovery) &&
        result.structuredContent.recovery.retryable === false
    );
}

function containsExactString(value, target, seen = new Set()) {
    if (value === target) return true;
    if (typeof value !== "object" || value === null || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) {
        return value.some((entry) => containsExactString(entry, target, seen));
    }
    return Object.values(value).some((entry) => containsExactString(entry, target, seen));
}

async function delay(milliseconds) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
