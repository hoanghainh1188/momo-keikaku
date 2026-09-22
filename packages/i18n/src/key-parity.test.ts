import { describe, expect, it } from 'vitest';
import { flattenKeys, messagesOf } from './index';

describe('i18n catalogs', () => {
  it('keeps identical key sets in en and ja', () => {
    expect(flattenKeys(messagesOf('ja'))).toEqual(flattenKeys(messagesOf('en')));
  });
});
