import { describe, it, expect } from 'vitest';
import { ok, err, mapResult, flatMapResult, unwrapOr } from '../utils/result.js';

describe('Result utilities', () => {
  it('ok() creates success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('err() creates error result', () => {
    const result = err('something went wrong');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('something went wrong');
    }
  });

  it('mapResult transforms value on ok', () => {
    const result = ok(10);
    const mapped = mapResult(result, (v) => v * 2);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value).toBe(20);
    }
  });

  it('mapResult passes through error on err', () => {
    const result = err('fail');
    const mapped = mapResult(result, (v: number) => v * 2);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.error).toBe('fail');
    }
  });

  it('flatMapResult chains results', () => {
    const result = ok(5);
    const chained = flatMapResult(result, (v) => (v > 3 ? ok(v * 10) : err('too small')));
    expect(chained.ok).toBe(true);
    if (chained.ok) {
      expect(chained.value).toBe(50);
    }
  });

  it('flatMapResult returns error on failure', () => {
    const result = ok(1);
    const chained = flatMapResult(result, (v) => (v > 3 ? ok(v * 10) : err('too small')));
    expect(chained.ok).toBe(false);
    if (!chained.ok) {
      expect(chained.error).toBe('too small');
    }
  });

  it('unwrapOr returns value on ok', () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it('unwrapOr returns default on err', () => {
    expect(unwrapOr(err('fail'), 0)).toBe(0);
  });
});
