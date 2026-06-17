/**
 * Workspace-scoped sub-client. Pre-binds `workspaceId` to every
 * resource method via a `Proxy`, so callers write `ws.tags.list()`
 * instead of `client.tags.list({ workspaceId })`.
 *
 * The Proxy merges `{ workspaceId }` into the first argument when:
 * - The first argument is an object and doesn't already have a
 *   `workspaceId` key, OR
 * - The first argument is undefined / null (treated as `{}`).
 *
 * Design decision: scoped `workspaceId` WINS over an explicit one
 * passed in the request. This matches the user intent ("use THIS
 * workspace for this chain of calls"). If you need to call across
 * workspaces in one block, use the unscoped client directly.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts-115";
 *
 * const client = createClockifyClient();
 * const ws = client.workspace("65b382b606de527a7ee2b60e");
 *
 * const tags = await ws.tags.list();
 * const project = await ws.projects.create({ name: "Q1" });
 * ```
 */
import type { ApprovalsClient } from "./src/api/resources/approvals/client/Client.js";
import type { AuditLogReportClient } from "./src/api/resources/auditLogReport/client/Client.js";
import type { BalancesClient } from "./src/api/resources/balances/client/Client.js";
import type { ClientsClient } from "./src/api/resources/clients/client/Client.js";
import type { CustomFieldsClient } from "./src/api/resources/customFields/client/Client.js";
import type { EntityChangesExperimentalClient } from "./src/api/resources/entityChangesExperimental/client/Client.js";
import type { ExpenseCategoriesClient } from "./src/api/resources/expenseCategories/client/Client.js";
import type { ExpenseReportClient } from "./src/api/resources/expenseReport/client/Client.js";
import type { ExpensesClient } from "./src/api/resources/expenses/client/Client.js";
import type { FilesClient } from "./src/api/resources/files/client/Client.js";
import type { HolidaysClient } from "./src/api/resources/holidays/client/Client.js";
import type { InvoiceItemsClient } from "./src/api/resources/invoiceItems/client/Client.js";
import type { InvoicePaymentsClient } from "./src/api/resources/invoicePayments/client/Client.js";
import type { InvoicesClient } from "./src/api/resources/invoices/client/Client.js";
import type { InvoiceSettingsClient } from "./src/api/resources/invoiceSettings/client/Client.js";
import type { MemberProfilesClient } from "./src/api/resources/memberProfiles/client/Client.js";
import type { PoliciesClient } from "./src/api/resources/policies/client/Client.js";
import type { ProjectsClient } from "./src/api/resources/projects/client/Client.js";
import type { ReportsClient } from "./src/api/resources/reports/client/Client.js";
import type { SchedulingClient } from "./src/api/resources/scheduling/client/Client.js";
import type { SharedReportsClient } from "./src/api/resources/sharedReports/client/Client.js";
import type { TagsClient } from "./src/api/resources/tags/client/Client.js";
import type { TasksClient } from "./src/api/resources/tasks/client/Client.js";
import type { TimeEntriesClient } from "./src/api/resources/timeEntries/client/Client.js";
import type { TimeOffClient } from "./src/api/resources/timeOff/client/Client.js";
import type { TimeOffPoliciesClient } from "./src/api/resources/timeOffPolicies/client/Client.js";
import type { UserGroupsClient } from "./src/api/resources/userGroups/client/Client.js";
import type { UsersClient } from "./src/api/resources/users/client/Client.js";
import type { WebhooksClient } from "./src/api/resources/webhooks/client/Client.js";
import type { WorkspacesClient } from "./src/api/resources/workspaces/client/Client.js";
import type { ClockifyApiClient } from "./src/index.js";

/** Sub-client view of `ClockifyApiClient` with `workspaceId`
 *  pre-bound on every resource method.
 *
 *  Construct via `client.workspace(id)`, not the class constructor
 *  directly — the factory is the documented API. */
export class Workspace {
    /** The workspaceId pre-bound on every method this sub-client exposes. */
    public readonly workspaceId: string;

    private readonly client: ClockifyApiClient;
    private readonly resourceCache = new Map<string, unknown>();

    constructor(client: ClockifyApiClient, workspaceId: string) {
        this.client = client;
        this.workspaceId = workspaceId;
    }

    // -----------------------------------------------------------------------
    // Resource accessors — each returns a Proxy-wrapped generated resource client
    // with workspaceId auto-injected. Cached per call so identity is stable
    // across repeat accesses (`ws.tags === ws.tags`).
    // All names match the getters on ClockifyApiClient exactly.
    // Types mirror the generated client types so callers get full IDE
    // completion — the Proxy is transparent at the type level.
    // -----------------------------------------------------------------------

    get approvals(): ApprovalsClient {
        return this.scoped("approvals") as ApprovalsClient;
    }
    get auditLogReport(): AuditLogReportClient {
        return this.scoped("auditLogReport") as AuditLogReportClient;
    }
    get balances(): BalancesClient {
        return this.scoped("balances") as BalancesClient;
    }
    get clients(): ClientsClient {
        return this.scoped("clients") as ClientsClient;
    }
    get customFields(): CustomFieldsClient {
        return this.scoped("customFields") as CustomFieldsClient;
    }
    get entityChangesExperimental(): EntityChangesExperimentalClient {
        return this.scoped("entityChangesExperimental") as EntityChangesExperimentalClient;
    }
    get expenseCategories(): ExpenseCategoriesClient {
        return this.scoped("expenseCategories") as ExpenseCategoriesClient;
    }
    get expenseReport(): ExpenseReportClient {
        return this.scoped("expenseReport") as ExpenseReportClient;
    }
    get expenses(): ExpensesClient {
        return this.scoped("expenses") as ExpensesClient;
    }
    get files(): FilesClient {
        return this.scoped("files") as FilesClient;
    }
    get holidays(): HolidaysClient {
        return this.scoped("holidays") as HolidaysClient;
    }
    get invoiceItems(): InvoiceItemsClient {
        return this.scoped("invoiceItems") as InvoiceItemsClient;
    }
    get invoicePayments(): InvoicePaymentsClient {
        return this.scoped("invoicePayments") as InvoicePaymentsClient;
    }
    get invoices(): InvoicesClient {
        return this.scoped("invoices") as InvoicesClient;
    }
    get invoiceSettings(): InvoiceSettingsClient {
        return this.scoped("invoiceSettings") as InvoiceSettingsClient;
    }
    get memberProfiles(): MemberProfilesClient {
        return this.scoped("memberProfiles") as MemberProfilesClient;
    }
    get policies(): PoliciesClient {
        return this.scoped("policies") as PoliciesClient;
    }
    get projects(): ProjectsClient {
        return this.scoped("projects") as ProjectsClient;
    }
    get reports(): ReportsClient {
        return this.scoped("reports") as ReportsClient;
    }
    get scheduling(): SchedulingClient {
        return this.scoped("scheduling") as SchedulingClient;
    }
    get sharedReports(): SharedReportsClient {
        return this.scoped("sharedReports") as SharedReportsClient;
    }
    get tags(): TagsClient {
        return this.scoped("tags") as TagsClient;
    }
    get tasks(): TasksClient {
        return this.scoped("tasks") as TasksClient;
    }
    get timeEntries(): TimeEntriesClient {
        return this.scoped("timeEntries") as TimeEntriesClient;
    }
    get timeOff(): TimeOffClient {
        return this.scoped("timeOff") as TimeOffClient;
    }
    get timeOffPolicies(): TimeOffPoliciesClient {
        return this.scoped("timeOffPolicies") as TimeOffPoliciesClient;
    }
    get userGroups(): UserGroupsClient {
        return this.scoped("userGroups") as UserGroupsClient;
    }
    get users(): UsersClient {
        return this.scoped("users") as UsersClient;
    }
    get webhooks(): WebhooksClient {
        return this.scoped("webhooks") as WebhooksClient;
    }
    get workspaces(): WorkspacesClient {
        return this.scoped("workspaces") as WorkspacesClient;
    }

    /** Internal: build a Proxy over the named resource. Cached per resource
     *  name so repeated `ws.tags` accesses return the same Proxy instance. */
    private scoped(name: string): unknown {
        const cached = this.resourceCache.get(name);
        if (cached != null) return cached;

        const target = (this.client as unknown as Record<string, unknown>)[name];
        if (target == null || typeof target !== "object") {
            // The generated client does not have this resource; return the raw value.
            // This is defensive; in practice every name above maps to a real
            // resource client.
            return target;
        }

        const wrapped = wrapResource(target, this.workspaceId);
        this.resourceCache.set(name, wrapped);
        return wrapped;
    }
}

/** Build a Proxy over a generated resource client that auto-injects
 *  `workspaceId` into the first argument of every method call.
 *
 *  - The first argument is checked for an existing `workspaceId` key.
 *    If absent (or the arg is `undefined` / `null`), `workspaceId` is
 *    merged in.
 *  - Scoped `workspaceId` ALWAYS wins over a key explicitly passed
 *    in the request — see the JSDoc on `Workspace` for rationale.
 *  - Non-function properties pass through unchanged.
 *
 *  This is exposed publicly so advanced callers can scope arbitrary
 *  objects (e.g., third-party SDK clients with the same shape). */
export function wrapResource<T extends object>(resource: T, workspaceId: string): T {
    return new Proxy(resource, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== "function") return value;
            // Bind `this` to the original resource so the method's
            // internal `this._options.fetcher` lookups work.
            return function (this: unknown, ...args: unknown[]) {
                const first = args[0];
                if (first == null) {
                    args[0] = { workspaceId };
                } else if (typeof first === "object" && !Array.isArray(first)) {
                    // Spread first then override workspaceId — scoped wins.
                    args[0] = { ...(first as Record<string, unknown>), workspaceId };
                }
                // first is a primitive (string/number) — leave untouched.
                // Purely defensive: every generated method takes a single request
                // object, so this branch only guards third-party callers that pass
                // `wrapResource` a positional first arg.
                return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
        },
    });
}
