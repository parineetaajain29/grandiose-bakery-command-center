import { describe, expect, it } from 'vitest';
import { hashPin, parseCookies, verifyPin } from './auth.ts';

describe('hashPin / verifyPin', () => {
  it('verifies the correct PIN against its own hash', () => {
    const stored = hashPin('1001');
    expect(verifyPin('1001', stored)).toBe(true);
  });

  it('rejects an incorrect PIN', () => {
    const stored = hashPin('1001');
    expect(verifyPin('9999', stored)).toBe(false);
  });

  it('salts each hash independently, so the same PIN never hashes the same way twice', () => {
    const a = hashPin('1001');
    const b = hashPin('1001');
    expect(a).not.toBe(b);
    expect(verifyPin('1001', a)).toBe(true);
    expect(verifyPin('1001', b)).toBe(true);
  });

  it('rejects a malformed stored value instead of throwing', () => {
    expect(verifyPin('1001', 'not-a-valid-hash')).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses a single cookie', () => {
    expect(parseCookies('sid=abc123')).toEqual({ sid: 'abc123' });
  });

  it('parses multiple cookies and trims whitespace', () => {
    expect(parseCookies('sid=abc123; theme=dark')).toEqual({ sid: 'abc123', theme: 'dark' });
  });

  it('returns an empty object for an undefined header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});
