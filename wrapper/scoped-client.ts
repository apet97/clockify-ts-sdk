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
 * const ws = client.workspace("your-workspace-id");
 *
 * const tags = await ws.tags.list();
 * const project = await ws.projects.create({ name: "Q1" });
 * ```
 */
import { warnOnce } from "./deprecation.js";
import { ensureClient as ensureClientHelper, ensureProject as ensureProjectHelper, ensureTag as ensureTagHelper, type EnsureResult, type NamedRecord } from "./ensure.js";
import { iterAll, type IterOptions } from "./iter.js";
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
import type { ClockifyApi, ClockifyApiClient } from "./src/index.js";

type ScopedRequest<T> = T extends object
    ? Omit<T, "workspaceId"> & { workspaceId?: never }
    : T;
type ScopedMethod<T> = T extends (
    request: infer Request,
    ...rest: infer Rest
) => infer Result
    ? (request?: ScopedRequest<Request>, ...rest: Rest) => Result
    : T;
export type ScopedResource<T> = {
    [Key in keyof T]: ScopedMethod<T[Key]>;
};

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

    get approvals(): ScopedResource<ApprovalsClient> {
        return this.scoped("approvals");
    }
    get auditLogReport(): ScopedResource<AuditLogReportClient> {
        return this.scoped("auditLogReport");
    }
    get balances(): ScopedResource<BalancesClient> {
        return this.scoped("balances");
    }
    get clients(): ScopedResource<ClientsClient> {
        return this.scoped("clients");
    }
    get customFields(): ScopedResource<CustomFieldsClient> {
        return this.scoped("customFields");
    }
    /**
     * @experimental
     * @beta Clockify's entity-changes API is experimental and may change or
     *   be withdrawn without a major-version bump on our side.
     */
    get entityChangesExperimental(): ScopedResource<EntityChangesExperimentalClient> {
        warnOnce(
            "Workspace.entityChangesExperimental",
            "`entityChangesExperimental` is experimental; the underlying Clockify API may change or be withdrawn without notice.",
        );
        return this.scoped("entityChangesExperimental");
    }
    get expenseCategories(): ScopedResource<ExpenseCategoriesClient> {
        return this.scoped("expenseCategories");
    }
    get expenseReport(): ScopedResource<ExpenseReportClient> {
        return this.scoped("expenseReport");
    }
    get expenses(): ScopedResource<ExpensesClient> {
        return this.scoped("expenses");
    }
    get files(): ScopedResource<FilesClient> {
        return this.scoped("files");
    }
    get holidays(): ScopedResource<HolidaysClient> {
        return this.scoped("holidays");
    }
    get invoiceItems(): ScopedResource<InvoiceItemsClient> {
        return this.scoped("invoiceItems");
    }
    get invoicePayments(): ScopedResource<InvoicePaymentsClient> {
        return this.scoped("invoicePayments");
    }
    get invoices(): ScopedResource<InvoicesClient> {
        return this.scoped("invoices");
    }
    get invoiceSettings(): ScopedResource<InvoiceSettingsClient> {
        return this.scoped("invoiceSettings");
    }
    get memberProfiles(): ScopedResource<MemberProfilesClient> {
        return this.scoped("memberProfiles");
    }
    get projects(): ScopedResource<ProjectsClient> {
        return this.scoped("projects");
    }
    get reports(): ScopedResource<ReportsClient> {
        return this.scoped("reports");
    }
    get scheduling(): ScopedResource<SchedulingClient> {
        return this.scoped("scheduling");
    }
    get sharedReports(): ScopedResource<SharedReportsClient> {
        return this.scoped("sharedReports");
    }
    get tags(): ScopedResource<TagsClient> {
        return this.scoped("tags");
    }
    get tasks(): ScopedResource<TasksClient> {
        return this.scoped("tasks");
    }
    get timeEntries(): ScopedResource<TimeEntriesClient> {
        return this.scoped("timeEntries");
    }
    get timeOff(): ScopedResource<TimeOffClient> {
        return this.scoped("timeOff");
    }
    get timeOffPolicies(): ScopedResource<TimeOffPoliciesClient> {
        return this.scoped("timeOffPolicies");
    }
    get userGroups(): ScopedResource<UserGroupsClient> {
        return this.scoped("userGroups");
    }
    get users(): ScopedResource<UsersClient> {
        return this.scoped("users");
    }
    get webhooks(): ScopedResource<WebhooksClient> {
        return this.scoped("webhooks");
    }
    get workspaces(): ScopedResource<WorkspacesClient> {
        return this.scoped("workspaces");
    }

    // -----------------------------------------------------------------------
    // Ergonomic upsert helpers — find-or-create by name on the three
    // duplicate-name-prone resources (tags / projects / clients), with the
    // workspaceId and list/create callbacks wired for you (no DI boilerplate).
    // Idempotent; reuses a single case-insensitive match, throws on an
    // ambiguous active-name match. (For auto-paginated walks, see the scoped
    // `iterProjects` / `iterTags` / `iterClients` iterators below.)
    // -----------------------------------------------------------------------

    /** Find a tag by name (case-insensitive) or create it. Idempotent. */
    ensureTag(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureTagHelper<NamedRecord>({
            name,
            list: async () => {
                const out: NamedRecord[] = [];
                for await (const t of this.iterTags()) out.push(t);
                return out;
            },
            create: async (n) => await this.client.tags.create({ workspaceId, name: n }),
        });
    }

    /** Find a project by name (case-insensitive) or create it. Idempotent. */
    ensureProject(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureProjectHelper<NamedRecord>({
            name,
            list: async () => {
                const out: NamedRecord[] = [];
                for await (const p of this.iterProjects()) out.push(p);
                return out;
            },
            create: async (n) => await this.client.projects.create({ workspaceId, name: n }),
        });
    }

    /** Find a client by name (case-insensitive) or create it. Idempotent. */
    ensureClient(name: string): Promise<EnsureResult<NamedRecord>> {
        const workspaceId = this.workspaceId;
        return ensureClientHelper<NamedRecord>({
            name,
            list: async () => {
                const out: NamedRecord[] = [];
                for await (const c of this.iterClients()) out.push(c);
                return out;
            },
            create: async (n) => await this.client.clients.create({ workspaceId, body: { name: n } }),
        });
    }

    // -----------------------------------------------------------------------
    // Scoped auto-paginated iterators — walk every record on the three
    // duplicate-name-prone resources without the `iterAll(...).bind(...)`
    // ritual. The workspaceId is re-added internally; `page` / `page-size` are
    // owned by the iterator. Bind to the UN-proxied `this.client.<r>` so the
    // proxy doesn't double-inject workspaceId.
    // -----------------------------------------------------------------------

    /** Walk every project in this workspace, auto-paginating. No `.bind` ritual. */
    iterProjects(
        request: Omit<ClockifyApi.ListProjectsRequest, "workspaceId" | "page" | "page-size"> = {},
        options?: IterOptions,
    ): AsyncGenerator<ClockifyApi.Project, void, void> {
        const list = this.client.projects.list.bind(this.client.projects);
        return iterAll(list, { ...request, workspaceId: this.workspaceId }, options);
    }

    /** Walk every tag in this workspace, auto-paginating. No `.bind` ritual. */
    iterTags(
        request: Omit<ClockifyApi.ListTagsRequest, "workspaceId" | "page" | "page-size"> = {},
        options?: IterOptions,
    ): AsyncGenerator<ClockifyApi.Tag, void, void> {
        const list = this.client.tags.list.bind(this.client.tags);
        return iterAll(list, { ...request, workspaceId: this.workspaceId }, options);
    }

    /** Walk every client in this workspace, auto-paginating. No `.bind` ritual. */
    iterClients(
        request: Omit<ClockifyApi.ListClientsRequest, "workspaceId" | "page" | "page-size"> = {},
        options?: IterOptions,
    ): AsyncGenerator<ClockifyApi.Client, void, void> {
        const list = this.client.clients.list.bind(this.client.clients);
        return iterAll(list, { ...request, workspaceId: this.workspaceId }, options);
    }

    /** Internal: build a Proxy over the named resource. Cached per resource
     *  name so repeated `ws.tags` accesses return the same Proxy instance. */
    private scoped<T extends object>(name: string): ScopedResource<T> {
        const cached = this.resourceCache.get(name);
        if (cached != null) return cached as ScopedResource<T>;

        const target = (this.client as unknown as Record<string, unknown>)[name];
        if (target == null || typeof target !== "object") {
            // The generated client does not have this resource; return the raw value.
            // This is defensive; in practice every name above maps to a real
            // resource client.
            return target as ScopedResource<T>;
        }

        const wrapped = wrapResource(target, this.workspaceId);
        this.resourceCache.set(name, wrapped);
        return wrapped as ScopedResource<T>;
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
export function wrapResource<T extends object>(resource: T, workspaceId: string): ScopedResource<T> {
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
    }) as ScopedResource<T>;
}
