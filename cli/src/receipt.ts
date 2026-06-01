import { printJson, printNdjson, printObject, type OutputOptions } from "./output.js";

export interface CliEntityRef {
    type: string;
    id: string;
    name?: string;
}

export interface CliChangeSet {
    created?: CliEntityRef[];
    updated?: CliEntityRef[];
    deleted?: CliEntityRef[];
    reused?: CliEntityRef[];
}

export interface CliNextAction {
    command: string;
    reason?: string;
}

export interface CliReceipt {
    ok: true;
    action: string;
    entity: string;
    ids: Record<string, string>;
    data: Record<string, unknown>;
    changed?: CliChangeSet;
    warnings?: string[];
    next?: CliNextAction[];
}

export function printReceipt(receipt: CliReceipt, output: OutputOptions): void {
    const payload = {
        ...receipt.data,
        ok: receipt.ok,
        action: receipt.action,
        entity: receipt.entity,
        ids: receipt.ids,
        changed: receipt.changed ?? {},
        warnings: receipt.warnings ?? [],
        next: receipt.next ?? [],
    };

    if (output.mode === "json") {
        printJson(payload, output);
        return;
    }
    if (output.mode === "ndjson") {
        printNdjson(payload, output);
        return;
    }

    printObject(receipt.data, output);
}
