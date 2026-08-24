const MAX_PRINCIPAL_SUBJECT_LENGTH = 1_024;

export function isValidPrincipalSubject(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        value.trim() === value &&
        value.length <= MAX_PRINCIPAL_SUBJECT_LENGTH
    );
}
