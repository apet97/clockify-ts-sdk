/**
 * Pull a string `id` from an SDK response without scattering
 * `as { id?: string }` across CLI commands. A wrong-shaped value yields
 * `undefined`, never a silently typed absent field.
 */
export function entityId(value: unknown): string | undefined {
    if (value && typeof value === "object" && "id" in value) {
        const id = (value as { id?: unknown }).id;
        return typeof id === "string" ? id : undefined;
    }
    return undefined;
}
