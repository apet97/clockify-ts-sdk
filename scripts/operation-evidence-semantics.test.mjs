#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parse } from "yaml";

import {
    buildOperationEvidenceSemanticExpectations,
    extractCanonicalPaginatedRoutes,
} from "./lib/operation-evidence-semantics.mjs";

function canonicalFixture() {
    const inventory = JSON.parse(
        readFileSync(new URL("../docs/openapi-operations.json", import.meta.url), "utf8"),
    );
    const openapi = parse(
        readFileSync(
            new URL("../spec/corrected/clockify.corrected.openapi.yaml", import.meta.url),
            "utf8",
        ),
    );
    const semanticContract = JSON.parse(
        readFileSync(
            new URL("../docs/operation-evidence-semantic-contract.json", import.meta.url),
            "utf8",
        ),
    );
    return buildOperationEvidenceSemanticExpectations({ inventory, openapi, semanticContract });
}

function sorted(values) {
    return [...values].sort();
}

test("extracts the exact pagination route contract from the canonical Ruby generator syntax", () => {
    const source = `
PAGINATED_LIST_OPS = Set.new([
  ["get", "/workspaces/{workspaceId}/clients"],
  ["post", "/workspaces/{workspaceId}/example"]
]).freeze
`;

    assert.deepEqual(extractCanonicalPaginatedRoutes(source), [
        ["GET", "/workspaces/{workspaceId}/clients"],
        ["POST", "/workspaces/{workspaceId}/example"],
    ]);
});

test("pins pagination evidence to the exact canonical page and page-size operation set", () => {
    const expectations = canonicalFixture();
    const pagination = expectations["gen-clockify-openapi.pagination-params-stamped"];

    assert.equal(pagination.applicability, "operation-specific");
    assert.deepEqual(
        sorted(pagination.operationIds),
        sorted([
            "getApprovalRequests",
            "getWorkspacesWorkspaceIdClients",
            "listWorkspaceCustomFields",
            "getWorkspaceExpenses",
            "getExpenseCategories",
            "getWorkspaceHolidays",
            "getWorkspaceInvoices",
            "getInvoicePayments",
            "getWorkspaceProjects",
            "listProjectCustomFields",
            "findTasksOnProject",
            "getAllSchedulingAssignments",
            "getWorkspacesWorkspaceIdTags",
            "getWorkspacesWorkspaceIdTimeEntriesStatusInProgress",
            "getBalancesForPolicy",
            "getBalanceForUser",
            "getTimeOffPolicies",
            "findAllGroupsOnWorkspace",
            "getWorkspacesWorkspaceIdUserUserIdTimeEntries",
            "findWorkspaceUsers",
            "findUserTeamManagers",
        ]),
    );
    assert.ok(!pagination.operationIds.includes("getUserCapacityTotal"));
});

test("classifies the historical bare-array Fern pagination experiment as generator-wide", () => {
    const expectations = canonicalFixture();

    assert.deepEqual(expectations["fern.x-fern-pagination.bare-array-unsupported"], {
        applicability: "not-operation-specific",
        operationIds: [],
    });
});

test("pins both literal-vs-id collision anchors to every current operation on the six routes", () => {
    const expectations = canonicalFixture();
    const expected = sorted([
        "getExpenseCategories",
        "addExpenseCategory",
        "getExpenseById",
        "updateExpense",
        "deleteExpense",
        "getInvoiceSettings",
        "updateInvoiceSettings",
        "getInvoiceById",
        "updateInvoice",
        "deleteInvoice",
        "publishAssignments",
    ]);

    for (const evidenceId of [
        "routes.literal-vs-parameterized.collisions",
        "fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings",
    ]) {
        assert.equal(expectations[evidenceId].applicability, "operation-specific");
        assert.deepEqual(sorted(expectations[evidenceId].operationIds), expected);
    }
});

test("derives every operation whose response reaches the shared TimeOffRequestStatus schema", () => {
    const expectations = canonicalFixture();
    const expected = sorted([
        "createTimeOffRequest",
        "createTimeOffRequestForUser",
        "changeTimeOffRequestStatus",
        "deleteTimeOffRequest",
        "getAllTimeOffRequestsOnWorkspace",
        "getWorkspacesWorkspaceIdTimeOffRequestsRequestId",
        "patchWorkspacesWorkspaceIdTimeOffRequestsRequestIdStatus",
    ]);

    for (const evidenceId of [
        "time-off-b.yaml.changedForUserName.malformed-inline-yaml",
        "time-off.request.status.schema-collision",
    ]) {
        assert.equal(expectations[evidenceId].applicability, "operation-specific");
        assert.deepEqual(sorted(expectations[evidenceId].operationIds), expected);
    }
});
