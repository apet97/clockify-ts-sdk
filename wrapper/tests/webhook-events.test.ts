import { describe, expect, it } from "vitest";

import type {
    ClockifyWebhookEvent,
    WebhookEventName,
    WebhookEventNewTimerStarted,
    WebhookEventTagDeleted,
} from "../webhook-events.js";
import { CLOCKIFY_WEBHOOK_EVENT_NAMES } from "../webhook-events.js";
import { constructEvent } from "../webhooks.js";

const TEST_TOKEN = "x".repeat(32);

describe("ClockifyWebhookEvent", () => {
    it("CLOCKIFY_WEBHOOK_EVENT_NAMES contains all 50 events", () => {
        // Update this count if the catalog changes.
        expect(CLOCKIFY_WEBHOOK_EVENT_NAMES.length).toBe(50);
        expect(new Set(CLOCKIFY_WEBHOOK_EVENT_NAMES).size).toBe(50); // no dupes
    });

    it("constructEvent returns typed union by default", () => {
        const payload = JSON.stringify({
            event: "TAG_DELETED",
            id: "tag-1",
            name: "x",
            workspaceId: "ws-1",
            archived: false,
        });
        const event = constructEvent({
            headers: { "Clockify-Signature-Token": TEST_TOKEN },
            payload,
            expectedToken: TEST_TOKEN,
        });
        expect(event.event).toBe("TAG_DELETED");

        // Type-level check (compile-time only)
        const _typed: ClockifyWebhookEvent = event;
        void _typed;

        // Exhaustive narrowing
        if (event.event === "TAG_DELETED") {
            const _narrowed: WebhookEventTagDeleted = event;
            void _narrowed;
        }
    });

    it("union has 50 variants (event-name extraction)", () => {
        const names = new Set<WebhookEventName>(CLOCKIFY_WEBHOOK_EVENT_NAMES);
        // Spot-check a few from each category to ensure coverage
        expect(names.has("NEW_TIMER_STARTED")).toBe(true); // TimeEntry
        expect(names.has("NEW_PROJECT")).toBe(true); // Project
        expect(names.has("TASK_DELETED")).toBe(true); // Task
        expect(names.has("NEW_CLIENT")).toBe(true); // Client
        expect(names.has("TAG_UPDATED")).toBe(true); // Tag
        expect(names.has("NEW_INVOICE")).toBe(true); // Invoice
        expect(names.has("USER_JOINED_WORKSPACE")).toBe(true); // User
        expect(names.has("NEW_APPROVAL_REQUEST")).toBe(true); // Approval
        expect(names.has("TIME_OFF_REQUESTED")).toBe(true); // TimeOff
        expect(names.has("EXPENSE_CREATED")).toBe(true); // Expense
        expect(names.has("ASSIGNMENT_CREATED")).toBe(true); // Assignment
        expect(names.has("USER_GROUP_CREATED")).toBe(true); // UserGroup
        expect(names.has("BILLABLE_RATE_UPDATED")).toBe(true); // Rate
    });

    it("compile-time: WebhookEventNewTimerStarted is assignable to ClockifyWebhookEvent", () => {
        // This test only proves the types compile correctly.
        // The cast below would be a type error if the variant isn't part of the union.
        const fake: WebhookEventNewTimerStarted = {
            event: "NEW_TIMER_STARTED",
            id: "te-1",
            description: "",
            tagIds: [],
            userId: "u-1",
            billable: false,
            taskId: null,
            projectId: null,
            timeInterval: { start: "2024-01-01T00:00:00Z", end: null, duration: null },
            workspaceId: "ws-1",
            isLocked: false,
            hourlyRate: null,
            costRate: null,
            customFieldValues: [],
        };
        const _asUnion: ClockifyWebhookEvent = fake;
        void _asUnion;
        expect(fake.event).toBe("NEW_TIMER_STARTED");
    });
});
