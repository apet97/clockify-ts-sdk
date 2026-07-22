/** Runtime-visible risk classes for the complete MCP tool surface. */
export type ToolRisk =
    | "read"
    | "routine_write"
    | "business_write"
    | "external_side_effect"
    | "privileged"
    | "destructive";

export const RISK_META_KEY = "io.github.apet97.clockify115/risk";
export const CONFIRMATION_META_KEY = "io.github.apet97.clockify115/confirmation";

export const UNGUARDED_TOOL_RISKS = ["read", "routine_write"] as const;
export const GUARDED_TOOL_RISKS = [
    "business_write",
    "external_side_effect",
    "privileged",
    "destructive",
] as const;

export type UnguardedToolRisk = (typeof UNGUARDED_TOOL_RISKS)[number];
export type GuardedToolRisk = (typeof GUARDED_TOOL_RISKS)[number];

/**
 * The single governed classification for all tools exposed by buildServer().
 * Runtime registration tests require this key set to equal the live tool set,
 * so adding or removing a tool cannot silently bypass risk review.
 */
export const TOOL_RISK_BY_NAME = {
    clockify_approvals_list: "read",
    clockify_approvals_resubmit: "business_write",
    clockify_approvals_submit: "business_write",
    clockify_approvals_update_state: "business_write",
    clockify_audit_log_search: "read",
    clockify_clients_create: "routine_write",
    clockify_clients_delete: "destructive",
    clockify_clients_get: "read",
    clockify_clients_list: "read",
    clockify_clients_update: "routine_write",
    clockify_create_work_package: "routine_write",
    clockify_custom_fields_create: "routine_write",
    clockify_custom_fields_delete: "destructive",
    clockify_custom_fields_list: "read",
    clockify_custom_fields_update: "routine_write",
    clockify_demo_cleanup: "destructive",
    clockify_demo_seed: "routine_write",
    clockify_docs_search: "read",
    clockify_doctor: "read",
    clockify_entity_changes_list: "read",
    clockify_entries_delete: "destructive",
    clockify_entries_get: "read",
    clockify_entries_list: "read",
    clockify_entries_log: "routine_write",
    clockify_entries_mark_invoiced: "business_write",
    clockify_entries_update: "routine_write",
    clockify_expenses_categories_archive: "business_write",
    clockify_expenses_categories_create: "business_write",
    clockify_expenses_categories_delete: "destructive",
    clockify_expenses_categories_list: "read",
    clockify_expenses_categories_update: "business_write",
    clockify_expenses_create: "business_write",
    clockify_expenses_delete: "destructive",
    clockify_expenses_get: "read",
    clockify_expenses_list: "read",
    clockify_expenses_update: "business_write",
    clockify_fix_entry: "routine_write",
    clockify_groups_add_member: "routine_write",
    clockify_groups_create: "routine_write",
    clockify_groups_delete: "destructive",
    clockify_groups_get: "read",
    clockify_groups_list: "read",
    clockify_groups_list_members: "read",
    clockify_groups_remove_member: "destructive",
    clockify_groups_update: "routine_write",
    clockify_holidays_create: "business_write",
    clockify_holidays_delete: "destructive",
    clockify_holidays_list: "read",
    clockify_holidays_list_in_period: "read",
    clockify_holidays_update: "business_write",
    clockify_invoice_client_work: "business_write",
    clockify_invoices_create: "business_write",
    clockify_invoices_delete: "destructive",
    clockify_invoices_export: "read",
    clockify_invoices_get: "read",
    clockify_invoices_import_time: "business_write",
    clockify_invoices_info: "read",
    clockify_invoices_items_list: "read",
    clockify_invoices_list: "read",
    clockify_invoices_payments_list: "read",
    clockify_invoices_update: "business_write",
    clockify_invoices_update_status: "business_write",
    clockify_log_work: "routine_write",
    clockify_member_profile_get: "read",
    clockify_member_profile_update: "routine_write",
    clockify_operation_guide: "read",
    clockify_plan_change: "read",
    clockify_project_custom_fields_list: "read",
    clockify_project_custom_fields_remove: "destructive",
    clockify_project_custom_fields_update: "routine_write",
    clockify_projects_create: "routine_write",
    clockify_projects_delete: "destructive",
    clockify_projects_get: "read",
    clockify_projects_list: "read",
    clockify_projects_memberships_list: "read",
    clockify_projects_memberships_update: "privileged",
    clockify_projects_set_member_rate: "business_write",
    clockify_projects_update: "routine_write",
    clockify_record_expense: "business_write",
    clockify_reports_attendance: "read",
    clockify_reports_detailed: "read",
    clockify_reports_expense: "read",
    clockify_reports_summary: "read",
    clockify_reports_weekly: "read",
    clockify_request_time_off: "business_write",
    clockify_review_day: "read",
    clockify_review_week: "read",
    clockify_schedule_work: "business_write",
    clockify_scheduling_assignments_create: "business_write",
    clockify_scheduling_assignments_delete: "destructive",
    clockify_scheduling_assignments_list: "read",
    clockify_scheduling_assignments_list_per_project: "read",
    clockify_scheduling_assignments_update: "business_write",
    clockify_scheduling_capacity: "read",
    clockify_scheduling_copy: "business_write",
    clockify_scheduling_publish: "business_write",
    clockify_sdk_snippet: "read",
    clockify_setup_webhook: "external_side_effect",
    clockify_shared_reports_create: "external_side_effect",
    clockify_shared_reports_delete: "destructive",
    clockify_shared_reports_list: "read",
    clockify_shared_reports_update: "external_side_effect",
    clockify_shared_reports_view: "read",
    clockify_start_work: "routine_write",
    clockify_status: "read",
    clockify_stop_work: "routine_write",
    clockify_switch_work: "routine_write",
    clockify_tags_create: "routine_write",
    clockify_tags_delete: "destructive",
    clockify_tags_get: "read",
    clockify_tags_list: "read",
    clockify_tags_update: "routine_write",
    clockify_tasks_create: "routine_write",
    clockify_tasks_delete: "destructive",
    clockify_tasks_get: "read",
    clockify_tasks_list: "read",
    clockify_tasks_set_rate: "business_write",
    clockify_tasks_update: "routine_write",
    clockify_time_off_balance_for_user: "read",
    clockify_time_off_balances_list: "read",
    clockify_time_off_balances_update: "business_write",
    clockify_time_off_policies_archive: "business_write",
    clockify_time_off_policies_create: "business_write",
    clockify_time_off_policies_get: "read",
    clockify_time_off_policies_list: "read",
    clockify_time_off_policies_update: "business_write",
    clockify_time_off_requests_delete: "destructive",
    clockify_time_off_requests_get: "read",
    clockify_time_off_requests_list: "read",
    clockify_time_off_requests_submit: "business_write",
    clockify_time_off_requests_update_status: "business_write",
    clockify_timer_start: "routine_write",
    clockify_timer_stop: "routine_write",
    clockify_tools_guide: "read",
    clockify_users_grant_role: "privileged",
    clockify_users_invite: "privileged",
    clockify_users_list: "read",
    clockify_users_revoke_role: "privileged",
    clockify_users_set_member_rate: "business_write",
    clockify_users_set_status: "privileged",
    clockify_webhooks_create: "external_side_effect",
    clockify_webhooks_delete: "destructive",
    clockify_webhooks_delivery_diagnose: "read",
    clockify_webhooks_events: "read",
    clockify_webhooks_get: "read",
    clockify_webhooks_list: "read",
    clockify_webhooks_update: "external_side_effect",
} as const satisfies Record<string, ToolRisk>;

export type ToolName = keyof typeof TOOL_RISK_BY_NAME;
export type ToolNameForRisk<Risk extends ToolRisk> = {
    [Name in ToolName]: (typeof TOOL_RISK_BY_NAME)[Name] extends Risk ? Name : never;
}[ToolName];
export type UnguardedToolName = ToolNameForRisk<UnguardedToolRisk>;
export type GuardedToolName = ToolNameForRisk<GuardedToolRisk>;

export function riskForTool<Name extends ToolName>(name: Name): (typeof TOOL_RISK_BY_NAME)[Name];
export function riskForTool(name: string): ToolRisk;
export function riskForTool(name: string): ToolRisk {
    if (!Object.prototype.hasOwnProperty.call(TOOL_RISK_BY_NAME, name)) {
        throw new Error(`Unclassified MCP tool: ${name}`);
    }
    return TOOL_RISK_BY_NAME[name as ToolName];
}

export function riskForUnguardedTool(name: string): UnguardedToolRisk {
    const risk = riskForTool(name);
    if (!(UNGUARDED_TOOL_RISKS as readonly ToolRisk[]).includes(risk)) {
        throw new Error(`${name} must use defineGuardedTool`);
    }
    return risk as UnguardedToolRisk;
}

export function riskForGuardedTool(name: string): GuardedToolRisk {
    const risk = riskForTool(name);
    if (!(GUARDED_TOOL_RISKS as readonly ToolRisk[]).includes(risk)) {
        throw new Error(`${name} must use defineTool`);
    }
    return risk as GuardedToolRisk;
}
