import { realpathSync } from "node:fs";

/** Match an executable path to its module after resolving npm's bin symlink. */
export function resolvesToModule(
    argvPath: string | undefined,
    moduleFilename: string,
): boolean {
    try {
        return argvPath !== undefined && realpathSync(argvPath) === moduleFilename;
    } catch {
        return false;
    }
}
