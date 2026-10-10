/**
 * What a use case returns: `Result<T, AppError>`.
 *
 * ARCHITECTURE-SPINE.md fixes the shape — `AppError = { code, messageKey, details? }`, with
 * `code` drawn from a CLOSED enum — and this file keeps that enum to the codes a use case
 * can actually produce today. It grows by adding a member here, never by a use case
 * inventing a string: a caller switching on `code` then gets a compile error for the case
 * it does not handle, rather than a default branch nobody wrote on purpose.
 *
 * The application layer returns CODES, never prose. `messageKey` is a catalog key, not a
 * sentence; turning it into words is the inbound adapter's job, through the i18n catalogs
 * story 1.9 fills. Nothing here looks a key up.
 *
 * `forbidden` is deliberately not a member. The epic's rule is that anything outside the
 * caller's permitted set answers `not_found`, so existence is not disclosed — a code that
 * could say "it exists, but not for you" would be the disclosure, whoever raised it.
 */
/** The closed set of failure codes. */
export const APP_ERROR_CODES = ['not_found', 'invalid_input'];
/** One catalog key per code. Keys, not text: `packages/i18n` owns the words. */
export const APP_ERROR_MESSAGE_KEYS = {
    not_found: 'errors.not_found',
    invalid_input: 'errors.invalid_input',
};
export function ok(value) {
    return { ok: true, value };
}
export function fail(code, details) {
    const error = details === undefined
        ? { code, messageKey: APP_ERROR_MESSAGE_KEYS[code] }
        : { code, messageKey: APP_ERROR_MESSAGE_KEYS[code], details };
    return { ok: false, error };
}
