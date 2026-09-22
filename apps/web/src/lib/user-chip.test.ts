import { describe, expect, it } from 'vitest';
import { formatUserChip, userLabelFromIdentity } from './user-chip';

describe('top-bar user chip (story 1.7 matrix)', () => {
  it('prefers a non-blank name over email', () => {
    expect(userLabelFromIdentity({ name: 'Linh', email: 'linh@example.test' })).toBe('Linh');
  });

  it('falls back to email when name is blank', () => {
    expect(userLabelFromIdentity({ name: '   ', email: 'linh@example.test' })).toBe(
      'linh@example.test',
    );
  });

  it('formats name (or email) · role', () => {
    expect(formatUserChip('Linh', 'Tenant Admin')).toBe('Linh · Tenant Admin');
    expect(formatUserChip('linh@example.test', 'PM')).toBe('linh@example.test · PM');
    expect(formatUserChip(undefined, 'PM')).toBe('PM');
  });
});
