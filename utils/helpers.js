export function removeNullKeys(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => value !== null)
    );
}