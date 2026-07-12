import type { Command } from "commander";

export type CliCommandRisk = "read" | "write" | "destructive";

export interface ClassifiedLeafCommand {
    command: Command;
    path: readonly string[];
    risk: CliCommandRisk;
}

const commandRisks = new WeakMap<Command, CliCommandRisk>();

/**
 * Register and classify one executable command. Grouping nodes continue to use
 * Commander's `command()` directly; every terminal command must come through
 * this helper so risk coverage is structural rather than source-text based.
 */
export function leafCommand(
    parent: Command,
    syntax: string,
    risk: CliCommandRisk,
): Command {
    if (commandRisks.has(parent)) {
        throw new Error(`A classified leaf cannot become a grouping node: ${parent.name()}`);
    }

    const name = commandName(syntax);
    if (parent.commands.some((command) => command.name() === name)) {
        throw new Error(`Command ${name} is already classified or registered under ${parent.name()}`);
    }

    const command = parent.command(syntax);
    if (commandRisks.has(command)) {
        throw new Error(`Command ${name} is already classified`);
    }
    commandRisks.set(command, risk);
    return command;
}

/**
 * Walk the real Commander tree and return its classified terminal commands.
 * Fails closed for both unclassified leaves and classified grouping nodes.
 */
export function collectClassifiedLeaves(root: Command): readonly ClassifiedLeafCommand[] {
    const leaves: ClassifiedLeafCommand[] = [];

    const visit = (command: Command, path: readonly string[]): void => {
        const risk = commandRisks.get(command);
        if (command.commands.length > 0) {
            if (risk !== undefined) {
                throw new Error(`Classified command ${path.join(" ")} is a grouping node`);
            }
            for (const child of command.commands) {
                visit(child, [...path, child.name()]);
            }
            return;
        }

        if (risk === undefined) {
            throw new Error(`Unclassified CLI leaf: ${path.join(" ")}`);
        }
        leaves.push({ command, path, risk });
    };

    for (const command of root.commands) {
        visit(command, [command.name()]);
    }
    return leaves;
}

function commandName(syntax: string): string {
    const [name] = syntax.trim().split(/[\s<[\]]/u);
    if (!name) throw new Error("Leaf command syntax must include a command name");
    return name;
}
