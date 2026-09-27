/**
 * Organisation Admin FormData helpers (story 2.17).
 */
import { describe, expect, it } from 'vitest';
import { field, optionalId, parseContractType, programsForDepartment } from './org-form-fields';

function form(entries: Record<string, FormDataEntryValue>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe('field', () => {
  it('returns trimmed strings', () => {
    expect(field(form({ name: '  Delivery  ' }), 'name')).toBe('Delivery');
  });

  it('treats a missing field as empty', () => {
    expect(field(form({}), 'name')).toBe('');
  });

  it('treats a non-string FormData value as empty (like forms.ts text)', () => {
    const data = new FormData();
    data.set('name', new File([], 'x.bin'));
    expect(field(data, 'name')).toBe('');
  });
});

describe('optionalId', () => {
  it('maps empty programId to null', () => {
    expect(optionalId(form({ programId: '' }), 'programId')).toBeNull();
  });

  it('maps whitespace-only programId to null', () => {
    expect(optionalId(form({ programId: '   ' }), 'programId')).toBeNull();
  });

  it('keeps a non-empty id', () => {
    expect(optionalId(form({ programId: ' prog-1 ' }), 'programId')).toBe('prog-1');
  });
});

describe('parseContractType', () => {
  it('accepts 請負 and 準委任', () => {
    expect(parseContractType('請負')).toBe('請負');
    expect(parseContractType('準委任')).toBe('準委任');
  });

  it('refuses anything else with null (no default)', () => {
    expect(parseContractType('')).toBeNull();
    expect(parseContractType('ukeoi')).toBeNull();
    expect(parseContractType('請負 ')).toBeNull();
  });
});

describe('programsForDepartment', () => {
  const programs = [
    { id: 'p1', departmentId: 'd1', name: 'Alpha' },
    { id: 'p2', departmentId: 'd2', name: 'Beta' },
    { id: 'p3', departmentId: 'd1', name: 'Gamma' },
  ] as const;

  it('keeps only Programs in the selected Department', () => {
    expect(programsForDepartment(programs, 'd1').map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('returns none when the Department has no Programs', () => {
    expect(programsForDepartment(programs, 'd-missing')).toEqual([]);
  });

  it('returns none when no Department is selected yet', () => {
    expect(programsForDepartment(programs, '')).toEqual([]);
  });
});
