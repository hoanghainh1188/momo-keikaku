/**
 * Organisation Admin form shaping (story 2.17) — pure FormData readers, same style as
 * `server/forms.ts`. Validity of names/ids stays in the use cases; contractType is closed here
 * so the action never invents a default.
 */

/** Absent or non-string FormData values read as ''. Trimmed for typed fields. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return (typeof value === 'string' ? value : '').trim();
}

/** Empty (after trim) → null — clear Program. */
export function optionalId(form: FormData, name: string): string | null {
  const value = field(form, name);
  return value === '' ? null : value;
}

/** Exact 請負 or 準委任 only — anything else is refused (no default). */
export function parseContractType(raw: string): '請負' | '準委任' | null {
  if (raw === '請負' || raw === '準委任') return raw;
  return null;
}

/** Programs offered in Create/Reassign selects — same Department only. */
export function programsForDepartment<T extends { readonly departmentId: string }>(
  programs: readonly T[],
  departmentId: string,
): readonly T[] {
  return programs.filter((program) => program.departmentId === departmentId);
}
