import { describe, expect, it } from 'vitest';
import { messageFromKey } from './error-message';

describe('messageFromKey', () => {
  it('maps errors.not_found through the catalog', () => {
    expect(messageFromKey('errors.not_found')).toContain('found');
  });

  it('maps errors.invalid_input through the catalog', () => {
    expect(messageFromKey('errors.invalid_input')).toContain('valid');
  });
});
