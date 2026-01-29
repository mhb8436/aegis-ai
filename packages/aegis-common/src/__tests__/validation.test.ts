import { describe, it, expect } from 'vitest';
import { validateMessage, validateSessionId } from '../utils/validation.js';

describe('validateMessage', () => {
  it('accepts valid string', () => {
    const result = validateMessage('Hello, world!');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Hello, world!');
    }
  });

  it('trims whitespace', () => {
    const result = validateMessage('  hello  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('hello');
    }
  });

  it('rejects non-string', () => {
    const result = validateMessage(123);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('message must be a string');
    }
  });

  it('rejects empty string', () => {
    const result = validateMessage('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('message must not be empty');
    }
  });

  it('rejects too long string', () => {
    const result = validateMessage('a'.repeat(10001));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('message must not exceed 10000 characters');
    }
  });
});

describe('validateSessionId', () => {
  it('accepts undefined', () => {
    const result = validateSessionId(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('accepts null', () => {
    const result = validateSessionId(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('accepts valid string', () => {
    const result = validateSessionId('session-123');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('session-123');
    }
  });

  it('rejects non-string', () => {
    const result = validateSessionId(42);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('sessionId must be a string');
    }
  });
});
