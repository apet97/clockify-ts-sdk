import { z } from "zod";

// Installed as every tool's output schema for CallToolResult.structuredContent.

const entityRefSchema = z
    .object({
        type: z.string(),
        id: z.string(),
        name: z.string().optional(),
    })
    .passthrough();

const changeSetSchema = z
    .object({
        created: z.array(entityRefSchema).optional(),
        updated: z.array(entityRefSchema).optional(),
        deleted: z.array(entityRefSchema).optional(),
        reused: z.array(entityRefSchema).optional(),
    })
    .passthrough();

const recoverySchema = z
    .object({
        hint: z.string(),
        tool: z.string().optional(),
        args: z.record(z.unknown()).optional(),
        retryable: z.boolean().optional(),
        retryAfterSeconds: z.number().int().optional(),
    })
    .passthrough();

export const MCP_RESULT_OUTPUT_SCHEMA = z
    .object({
        ok: z.boolean(),
        action: z.string(),
        entity: z.string().optional(),
        ids: z.record(z.string()).optional(),
        data: z.unknown().optional(),
        meta: z.record(z.unknown()).optional(),
        changed: changeSetSchema.optional(),
        warnings: z.array(z.object({ code: z.string().optional(), message: z.string() }).passthrough()).optional(),
        clarification: z
            .object({
                question: z.string(),
                field: z.string().optional(),
                candidates: z.array(entityRefSchema).optional(),
            })
            .passthrough()
            .optional(),
        next: z
            .array(
                z
                    .object({
                        tool: z.string(),
                        args: z.record(z.unknown()).optional(),
                        reason: z.string().optional(),
                    })
                    .passthrough(),
            )
            .optional(),
        error: z.object({ code: z.string(), message: z.string() }).passthrough().optional(),
        recovery: recoverySchema.optional(),
    })
    .passthrough();
