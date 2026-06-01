import type { Context } from "../../client.js";
import type { ChangeSet, EntityRef, NextAction, RecoveryHint, Warning } from "../../result.js";

export type WorkflowContext = Context;
export type AnyRecord = Record<string, unknown>;
export type Bucket = "created" | "updated" | "deleted" | "reused";

export type { ChangeSet, EntityRef, NextAction, RecoveryHint, Warning };
