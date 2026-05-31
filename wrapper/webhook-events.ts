/**
 * Typed discriminated union of all 50 Clockify webhook event payloads.
 *
 * Categories (13) and event counts:
 *   TimeEntry   (8)  NEW_TIMER_STARTED, TIMER_STOPPED, NEW_TIME_ENTRY,
 *                    TIME_ENTRY_UPDATED, TIME_ENTRY_DELETED, TIME_ENTRY_RESTORED,
 *                    TIME_ENTRY_SPLIT, TIME_ENTRY_BATCH_DELETED
 *   Project     (3)  NEW_PROJECT, PROJECT_UPDATED, PROJECT_DELETED
 *   Task        (3)  NEW_TASK, TASK_UPDATED, TASK_DELETED
 *   Client      (3)  NEW_CLIENT, CLIENT_UPDATED, CLIENT_DELETED
 *   Tag         (3)  NEW_TAG, TAG_UPDATED, TAG_DELETED
 *   Invoice     (2)  NEW_INVOICE, INVOICE_UPDATED
 *   User        (8)  USER_JOINED_WORKSPACE, USER_DELETED_FROM_WORKSPACE,
 *                    USER_DEACTIVATED_ON_WORKSPACE, USER_ACTIVATED_ON_WORKSPACE,
 *                    USER_EMAIL_CHANGED, USER_UPDATED,
 *                    USERS_INVITED_TO_WORKSPACE, LIMITED_USERS_ADDED_TO_WORKSPACE
 *   Approval    (2)  NEW_APPROVAL_REQUEST, APPROVAL_REQUEST_STATUS_UPDATED
 *   TimeOff     (5)  TIME_OFF_REQUESTED, TIME_OFF_REQUEST_APPROVED,
 *                    TIME_OFF_REQUEST_REJECTED, TIME_OFF_REQUEST_WITHDRAWN,
 *                    BALANCE_UPDATED
 *   Expense     (4)  EXPENSE_CREATED, EXPENSE_RESTORED, EXPENSE_UPDATED,
 *                    EXPENSE_DELETED
 *   Assignment  (4)  ASSIGNMENT_CREATED, ASSIGNMENT_PUBLISHED,
 *                    ASSIGNMENT_UPDATED, ASSIGNMENT_DELETED
 *   UserGroup   (3)  USER_GROUP_CREATED, USER_GROUP_UPDATED, USER_GROUP_DELETED
 *   Rate        (2)  BILLABLE_RATE_UPDATED, COST_RATE_UPDATED
 *
 * Total: 50 events.
 *
 * Ported from the reference catalog at
 * `clockify-typescript-sdk/src/webhook-payloads.ts`, adapted to use
 * locally generated types from `./src/api/types/`. Types not cleanly emitted
 * by the generator (e.g., approval/time-off status shapes, invoice line items,
 * rate-change payloads) are inline-defined here.
 */

// ===== Shared / Inline Types =====

/**
 * Compact time interval as delivered inside webhook payloads.
 * The generated `TimeIntervalDto` has many optional fields. Webhook
 * payloads carry a narrower shape: start (always present), end and
 * duration may be null (for a running timer).
 */
export interface ClockifyWebhookTimeInterval {
    start: string;
    end: string | null;
    duration: string | null;
}

/**
 * Custom-field value as delivered inside time-entry webhook payloads.
 * The generated `CustomFieldValueDto` has all-optional fields; webhook
 * payloads have required `customFieldId` and `value`.
 */
export interface ClockifyWebhookCustomFieldValue {
    customFieldId: string;
    value: unknown;
    timeEntryId?: string | undefined;
    sourceType?: string | undefined;
}

/**
 * Approval request owner shape in webhook payloads.
 * Not matching generated `ApprovalRequestOwnerDtoV1` (which has optional
 * fields and a `DayOfWeek` enum for `startOfWeek`); webhook sends plain
 * strings.
 */
export interface ClockifyWebhookApprovalOwner {
    userId: string;
    userName: string;
    timezone: string;
    startOfWeek: string;
}

/**
 * Approval request status shape in webhook payloads.
 * Generated `ApprovalRequestStatusDtoV1` uses an enum for `state`; webhook
 * delivers a plain string.
 */
export interface ClockifyWebhookApprovalStatus {
    state: string;
    updatedBy: string;
    updatedByUserName: string;
    updatedAt: string;
    note: string;
}

/**
 * Time-off request status shape in webhook payloads.
 * Generated `TimeOffRequestStatus` uses an enum for `statusType`; webhook
 * delivers a plain string and nullable fields.
 */
export interface ClockifyWebhookTimeOffStatus {
    statusType: string;
    changedByUserId: string | null;
    changedByUserName: string | null;
    changedAt: string | null;
    note: string | null;
}

// ===== TimeEntry (8 events) =====

/** Project shape as embedded within time-entry webhook payloads. */
export interface WebhookPayloadEmbeddedProject {
    id?: string | undefined;
    name?: string | undefined;
    workspaceId?: string | undefined;
    clientId?: string | undefined;
    clientName?: string | undefined;
    color?: string | undefined;
    archived?: boolean | undefined;
    billable?: boolean | undefined;
    public?: boolean | undefined;
    note?: string | undefined;
}

/** Task shape as embedded within time-entry webhook payloads. */
export interface WebhookPayloadEmbeddedTask {
    id?: string | undefined;
    name?: string | undefined;
    projectId?: string | undefined;
    status?: string | undefined;
    billable?: boolean | undefined;
    estimate?: string | undefined;
    assigneeIds?: string[] | undefined;
}

/** User shape as embedded within time-entry webhook payloads. */
export interface WebhookPayloadEmbeddedUser {
    id?: string | undefined;
    name?: string | undefined;
    email?: string | undefined;
    profilePicture?: string | undefined;
}

/** Tag shape as embedded within time-entry webhook payloads. */
export interface WebhookPayloadEmbeddedTag {
    id?: string | undefined;
    name?: string | undefined;
    workspaceId?: string | undefined;
    archived?: boolean | undefined;
}

/** Core time-entry payload shared by the 7 single-entry events. */
export interface WebhookPayloadTimeEntry {
    id: string;
    description: string;
    tagIds: string[];
    userId: string;
    billable: boolean;
    taskId: string | null;
    projectId: string | null;
    timeInterval: ClockifyWebhookTimeInterval;
    workspaceId: string;
    isLocked: boolean;
    hourlyRate: number | null;
    costRate: number | null;
    customFieldValues: ClockifyWebhookCustomFieldValue[];
    project?: WebhookPayloadEmbeddedProject | undefined;
    task?: WebhookPayloadEmbeddedTask | undefined;
    user?: WebhookPayloadEmbeddedUser | undefined;
    tags?: WebhookPayloadEmbeddedTag[] | undefined;
}

export interface WebhookEventNewTimerStarted extends WebhookPayloadTimeEntry {
    event: "NEW_TIMER_STARTED";
}

export interface WebhookEventTimerStopped extends WebhookPayloadTimeEntry {
    event: "TIMER_STOPPED";
}

export interface WebhookEventNewTimeEntry extends WebhookPayloadTimeEntry {
    event: "NEW_TIME_ENTRY";
}

export interface WebhookEventTimeEntryUpdated extends WebhookPayloadTimeEntry {
    event: "TIME_ENTRY_UPDATED";
}

export interface WebhookEventTimeEntryDeleted extends WebhookPayloadTimeEntry {
    event: "TIME_ENTRY_DELETED";
}

export interface WebhookEventTimeEntryRestored extends WebhookPayloadTimeEntry {
    event: "TIME_ENTRY_RESTORED";
}

export interface WebhookEventTimeEntrySplit extends WebhookPayloadTimeEntry {
    event: "TIME_ENTRY_SPLIT";
}

/** Batch-delete payload structure is not documented; accept any extra fields. */
export interface WebhookEventTimeEntryBatchDeleted {
    event: "TIME_ENTRY_BATCH_DELETED";
    [key: string]: unknown;
}

// ===== Project (3 events) =====

/** Project webhook payload (extends embedded project with hourlyRate). */
export interface WebhookPayloadProject extends WebhookPayloadEmbeddedProject {
    hourlyRate?:
        | {
              amount: number;
              currency: string;
          }
        | undefined;
}

export interface WebhookEventNewProject extends WebhookPayloadProject {
    event: "NEW_PROJECT";
}

export interface WebhookEventProjectUpdated extends WebhookPayloadProject {
    event: "PROJECT_UPDATED";
}

export interface WebhookEventProjectDeleted extends WebhookPayloadProject {
    event: "PROJECT_DELETED";
}

// ===== Task (3 events) =====

/** Task webhook payload. */
export type WebhookPayloadTask = WebhookPayloadEmbeddedTask;

export interface WebhookEventNewTask extends WebhookPayloadTask {
    event: "NEW_TASK";
}

export interface WebhookEventTaskUpdated extends WebhookPayloadTask {
    event: "TASK_UPDATED";
}

export interface WebhookEventTaskDeleted extends WebhookPayloadTask {
    event: "TASK_DELETED";
}

// ===== Client (3 events) =====

/** Client webhook payload. */
export interface WebhookPayloadClient {
    id?: string | undefined;
    name?: string | undefined;
    workspaceId?: string | undefined;
    archived?: boolean | undefined;
    address?: string | null | undefined;
    email?: string | null | undefined;
    note?: string | null | undefined;
}

export interface WebhookEventNewClient extends WebhookPayloadClient {
    event: "NEW_CLIENT";
}

export interface WebhookEventClientUpdated extends WebhookPayloadClient {
    event: "CLIENT_UPDATED";
}

export interface WebhookEventClientDeleted extends WebhookPayloadClient {
    event: "CLIENT_DELETED";
}

// ===== Tag (3 events) =====

/** Tag webhook payload. Matches the generated `Tag` / `TagDto` shape. */
export interface WebhookPayloadTag {
    id?: string | undefined;
    name?: string | undefined;
    workspaceId?: string | undefined;
    archived?: boolean | undefined;
}

export interface WebhookEventNewTag extends WebhookPayloadTag {
    event: "NEW_TAG";
}

export interface WebhookEventTagUpdated extends WebhookPayloadTag {
    event: "TAG_UPDATED";
}

export interface WebhookEventTagDeleted extends WebhookPayloadTag {
    event: "TAG_DELETED";
}

// ===== Invoice (2 events) =====

/** Single line item within an invoice webhook payload. */
export interface WebhookInvoiceItem {
    order: number;
    quantity: number;
    description: string;
    unitPrice: number;
    amount: number;
    itemType: string | null;
    timeEntryIds: string[];
}

/** Invoice webhook payload. Generated `InvoiceDtoV1` / `InvoiceDtoFull`
 *  use many optional fields; webhook delivers a concrete required shape. */
export interface WebhookPayloadInvoice {
    id: string;
    number: string;
    status: string;
    issuedDate: string;
    dueDate: string;
    subtotal: number;
    discount: number;
    tax: number;
    tax2: number;
    discountAmount: number;
    taxAmount: number;
    tax2Amount: number;
    amount: number;
    currency: string;
    subject: string;
    note: string;
    clientId: string;
    clientName: string;
    clientAddress: string;
    userId: string;
    items: WebhookInvoiceItem[];
}

export interface WebhookEventNewInvoice extends WebhookPayloadInvoice {
    event: "NEW_INVOICE";
}

export interface WebhookEventInvoiceUpdated extends WebhookPayloadInvoice {
    event: "INVOICE_UPDATED";
}

// ===== User (8 events) =====

/** User base shape in webhook payloads. */
export interface WebhookPayloadUser {
    id: string;
    email: string;
    name: string;
    profilePicture?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}

export interface WebhookEventUserJoinedWorkspace extends WebhookPayloadUser {
    event: "USER_JOINED_WORKSPACE";
}

export interface WebhookEventUserDeletedFromWorkspace extends WebhookPayloadUser {
    event: "USER_DELETED_FROM_WORKSPACE";
}

export interface WebhookEventUserDeactivatedOnWorkspace extends WebhookPayloadUser {
    event: "USER_DEACTIVATED_ON_WORKSPACE";
}

export interface WebhookEventUserActivatedOnWorkspace extends WebhookPayloadUser {
    event: "USER_ACTIVATED_ON_WORKSPACE";
}

export interface WebhookEventUserEmailChanged extends WebhookPayloadUser {
    event: "USER_EMAIL_CHANGED";
    oldEmail: string;
}

export interface WebhookEventUserUpdated extends WebhookPayloadUser {
    event: "USER_UPDATED";
}

export interface WebhookEventUsersInvitedToWorkspace {
    event: "USERS_INVITED_TO_WORKSPACE";
    workspaceId: string;
    inviter: WebhookPayloadUser;
    invitedUserEmails: string[];
}

export interface WebhookEventLimitedUsersAddedToWorkspace {
    event: "LIMITED_USERS_ADDED_TO_WORKSPACE";
    workspaceId: string;
    inviter: WebhookPayloadUser;
    invitedUserNames: string[];
}

// ===== Approval (2 events) =====

/** Approval request webhook payload. */
export interface WebhookPayloadApproval {
    id: string;
    workspaceId: string;
    dateRange: {
        start: string;
        end: string;
    };
    owner: ClockifyWebhookApprovalOwner;
    status: ClockifyWebhookApprovalStatus;
}

export interface WebhookEventNewApprovalRequest extends WebhookPayloadApproval {
    event: "NEW_APPROVAL_REQUEST";
}

export interface WebhookEventApprovalRequestStatusUpdated extends WebhookPayloadApproval {
    event: "APPROVAL_REQUEST_STATUS_UPDATED";
}

// ===== TimeOff (5 events) =====

/** Time-off request webhook payload. */
export interface WebhookPayloadTimeOff {
    id: string;
    userId: string;
    workspaceId: string;
    policyId: string;
    timeZone: string;
    halfDay: boolean;
    timeOffPeriod: {
        period: {
            start: string;
            end: string;
        };
    };
    note: string | null;
    status: ClockifyWebhookTimeOffStatus;
    balanceDiff: number;
    createdAt: string;
    requesterUserId: string;
    excludeDays: string[];
    negativeBalanceUsed: number;
    balanceValueAtRequest: number;
}

export interface WebhookEventTimeOffRequested extends WebhookPayloadTimeOff {
    event: "TIME_OFF_REQUESTED";
}

export interface WebhookEventTimeOffRequestApproved extends WebhookPayloadTimeOff {
    event: "TIME_OFF_REQUEST_APPROVED";
}

export interface WebhookEventTimeOffRequestRejected extends WebhookPayloadTimeOff {
    event: "TIME_OFF_REQUEST_REJECTED";
}

export interface WebhookEventTimeOffRequestWithdrawn extends WebhookPayloadTimeOff {
    event: "TIME_OFF_REQUEST_WITHDRAWN";
}

export interface WebhookEventBalanceUpdated {
    event: "BALANCE_UPDATED";
    workspaceId: string;
    userId: string;
    value: string;
    note: string;
    updatedBy: string;
}

// ===== Expense (4 events) =====

/** Expense created/restored payload (full shape). */
export interface WebhookPayloadExpenseCreatedRestored {
    id: string;
    workspaceId: string;
    userId: string;
    date: string;
    projectId: string;
    taskId?: string | null | undefined;
    categoryId: string;
    notes: string;
    quantity: number;
    billable: boolean;
    fileId: string;
    total: number;
    locked?: boolean | undefined;
}

/** Expense updated/deleted payload (slim shape — only IDs). */
export interface WebhookPayloadExpenseUpdatedDeleted {
    workspaceId: string;
    userId: string;
    projectId: string;
    expenseId: string;
    categoryId: string;
}

export interface WebhookEventExpenseCreated extends WebhookPayloadExpenseCreatedRestored {
    event: "EXPENSE_CREATED";
}

export interface WebhookEventExpenseRestored extends WebhookPayloadExpenseCreatedRestored {
    event: "EXPENSE_RESTORED";
}

export interface WebhookEventExpenseUpdated extends WebhookPayloadExpenseUpdatedDeleted {
    event: "EXPENSE_UPDATED";
}

export interface WebhookEventExpenseDeleted extends WebhookPayloadExpenseUpdatedDeleted {
    event: "EXPENSE_DELETED";
}

// ===== Assignment (4 events) =====

/** Assignment webhook payload (scheduling assignment). */
export interface WebhookPayloadAssignment {
    workspaceId: string;
    userId: string;
    projectId: string;
    assignmentId: string;
}

export interface WebhookEventAssignmentCreated extends WebhookPayloadAssignment {
    event: "ASSIGNMENT_CREATED";
}

export interface WebhookEventAssignmentPublished extends WebhookPayloadAssignment {
    event: "ASSIGNMENT_PUBLISHED";
}

export interface WebhookEventAssignmentUpdated extends WebhookPayloadAssignment {
    event: "ASSIGNMENT_UPDATED";
}

export interface WebhookEventAssignmentDeleted extends WebhookPayloadAssignment {
    event: "ASSIGNMENT_DELETED";
}

// ===== UserGroup (3 events) =====

/** User-group webhook payload. */
export interface WebhookPayloadUserGroup {
    id: string;
    name: string;
    workspaceId: string;
    userIds: string[];
    teamManagers: string[];
}

export interface WebhookEventUserGroupCreated extends WebhookPayloadUserGroup {
    event: "USER_GROUP_CREATED";
}

export interface WebhookEventUserGroupUpdated extends WebhookPayloadUserGroup {
    event: "USER_GROUP_UPDATED";
}

export interface WebhookEventUserGroupDeleted extends WebhookPayloadUserGroup {
    event: "USER_GROUP_DELETED";
}

// ===== Rate (2 events) =====

/** Rate-change webhook payload (billable or cost rate). */
export interface WebhookPayloadRate {
    workspaceId: string;
    rateChangeSource: string;
    modifiedEntity: {
        userId: string;
        hourlyRate: {
            amount: number;
        };
        costRate: {
            amount: number;
        };
        targetId: string;
        membershipType: string;
        membershipStatus: string;
    };
    currency: {
        id: string;
        code: string;
    };
    amount: number;
    since: string;
}

export interface WebhookEventBillableRateUpdated extends WebhookPayloadRate {
    event: "BILLABLE_RATE_UPDATED";
}

export interface WebhookEventCostRateUpdated extends WebhookPayloadRate {
    event: "COST_RATE_UPDATED";
}

// ===== Discriminated Union =====

/** Discriminated union of all 50 Clockify webhook event types.
 *  Narrow via `event.event` to get the typed payload for each variant. */
export type ClockifyWebhookEvent =
    // TimeEntry (8)
    | WebhookEventNewTimerStarted
    | WebhookEventTimerStopped
    | WebhookEventNewTimeEntry
    | WebhookEventTimeEntryUpdated
    | WebhookEventTimeEntryDeleted
    | WebhookEventTimeEntryRestored
    | WebhookEventTimeEntrySplit
    | WebhookEventTimeEntryBatchDeleted
    // Project (3)
    | WebhookEventNewProject
    | WebhookEventProjectUpdated
    | WebhookEventProjectDeleted
    // Task (3)
    | WebhookEventNewTask
    | WebhookEventTaskUpdated
    | WebhookEventTaskDeleted
    // Client (3)
    | WebhookEventNewClient
    | WebhookEventClientUpdated
    | WebhookEventClientDeleted
    // Tag (3)
    | WebhookEventNewTag
    | WebhookEventTagUpdated
    | WebhookEventTagDeleted
    // Invoice (2)
    | WebhookEventNewInvoice
    | WebhookEventInvoiceUpdated
    // User (8)
    | WebhookEventUserJoinedWorkspace
    | WebhookEventUserDeletedFromWorkspace
    | WebhookEventUserDeactivatedOnWorkspace
    | WebhookEventUserActivatedOnWorkspace
    | WebhookEventUserEmailChanged
    | WebhookEventUserUpdated
    | WebhookEventUsersInvitedToWorkspace
    | WebhookEventLimitedUsersAddedToWorkspace
    // Approval (2)
    | WebhookEventNewApprovalRequest
    | WebhookEventApprovalRequestStatusUpdated
    // TimeOff (5)
    | WebhookEventTimeOffRequested
    | WebhookEventTimeOffRequestApproved
    | WebhookEventTimeOffRequestRejected
    | WebhookEventTimeOffRequestWithdrawn
    | WebhookEventBalanceUpdated
    // Expense (4)
    | WebhookEventExpenseCreated
    | WebhookEventExpenseRestored
    | WebhookEventExpenseUpdated
    | WebhookEventExpenseDeleted
    // Assignment (4)
    | WebhookEventAssignmentCreated
    | WebhookEventAssignmentPublished
    | WebhookEventAssignmentUpdated
    | WebhookEventAssignmentDeleted
    // UserGroup (3)
    | WebhookEventUserGroupCreated
    | WebhookEventUserGroupUpdated
    | WebhookEventUserGroupDeleted
    // Rate (2)
    | WebhookEventBillableRateUpdated
    | WebhookEventCostRateUpdated;

/** The `event` discriminant string for any Clockify webhook event. */
export type WebhookEventName = ClockifyWebhookEvent["event"];

/** Exhaustive list of all 50 Clockify webhook event names, as a const array.
 *  Useful for validation, routing tables, and runtime narrowing. */
export const CLOCKIFY_WEBHOOK_EVENT_NAMES = [
    // TimeEntry (8)
    "NEW_TIMER_STARTED",
    "TIMER_STOPPED",
    "NEW_TIME_ENTRY",
    "TIME_ENTRY_UPDATED",
    "TIME_ENTRY_DELETED",
    "TIME_ENTRY_RESTORED",
    "TIME_ENTRY_SPLIT",
    "TIME_ENTRY_BATCH_DELETED",
    // Project (3)
    "NEW_PROJECT",
    "PROJECT_UPDATED",
    "PROJECT_DELETED",
    // Task (3)
    "NEW_TASK",
    "TASK_UPDATED",
    "TASK_DELETED",
    // Client (3)
    "NEW_CLIENT",
    "CLIENT_UPDATED",
    "CLIENT_DELETED",
    // Tag (3)
    "NEW_TAG",
    "TAG_UPDATED",
    "TAG_DELETED",
    // Invoice (2)
    "NEW_INVOICE",
    "INVOICE_UPDATED",
    // User (8)
    "USER_JOINED_WORKSPACE",
    "USER_DELETED_FROM_WORKSPACE",
    "USER_DEACTIVATED_ON_WORKSPACE",
    "USER_ACTIVATED_ON_WORKSPACE",
    "USER_EMAIL_CHANGED",
    "USER_UPDATED",
    "USERS_INVITED_TO_WORKSPACE",
    "LIMITED_USERS_ADDED_TO_WORKSPACE",
    // Approval (2)
    "NEW_APPROVAL_REQUEST",
    "APPROVAL_REQUEST_STATUS_UPDATED",
    // TimeOff (5)
    "TIME_OFF_REQUESTED",
    "TIME_OFF_REQUEST_APPROVED",
    "TIME_OFF_REQUEST_REJECTED",
    "TIME_OFF_REQUEST_WITHDRAWN",
    "BALANCE_UPDATED",
    // Expense (4)
    "EXPENSE_CREATED",
    "EXPENSE_RESTORED",
    "EXPENSE_UPDATED",
    "EXPENSE_DELETED",
    // Assignment (4)
    "ASSIGNMENT_CREATED",
    "ASSIGNMENT_PUBLISHED",
    "ASSIGNMENT_UPDATED",
    "ASSIGNMENT_DELETED",
    // UserGroup (3)
    "USER_GROUP_CREATED",
    "USER_GROUP_UPDATED",
    "USER_GROUP_DELETED",
    // Rate (2)
    "BILLABLE_RATE_UPDATED",
    "COST_RATE_UPDATED",
] as const satisfies WebhookEventName[];
