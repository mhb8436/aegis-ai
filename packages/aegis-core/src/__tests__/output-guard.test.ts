import { describe, it, expect } from 'vitest';
import { analyzeOutput } from '../guards/output-guard.js';

describe('Output Guard', () => {
  describe('PII detection', () => {
    it('detects 주민등록번호 with dash', async () => {
      const result = await analyzeOutput('주민등록번호는 900101-1234567 입니다');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings).toHaveLength(1);
      expect(result.piiFindings[0].type).toBe('RRN');
    });

    it('detects 주민등록번호 without dash', async () => {
      const result = await analyzeOutput('번호: 9001011234567');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings[0].type).toBe('RRN');
    });

    it('detects phone number with dashes', async () => {
      const result = await analyzeOutput('전화번호: 010-1234-5678');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings.some((f) => f.type === 'PHONE')).toBe(true);
    });

    it('detects phone number without dashes', async () => {
      const result = await analyzeOutput('연락처 01012345678 입니다');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings.some((f) => f.type === 'PHONE')).toBe(true);
    });

    it('detects email', async () => {
      const result = await analyzeOutput('이메일: test@example.com');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings.some((f) => f.type === 'EMAIL')).toBe(true);
    });

    it('detects card number', async () => {
      const result = await analyzeOutput('카드번호 1234-5678-9012-3456');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings.some((f) => f.type === 'CARD')).toBe(true);
    });

    it('detects bank account', async () => {
      const result = await analyzeOutput('계좌: 123-456789-12');
      expect(result.containsPii).toBe(true);
      expect(result.piiFindings.some((f) => f.type === 'ACCOUNT')).toBe(true);
    });
  });

  describe('masking', () => {
    it('masks detected PII in sanitized output', async () => {
      const result = await analyzeOutput('전화번호는 010-1234-5678 입니다');
      expect(result.sanitizedOutput).toBeDefined();
      expect(result.sanitizedOutput).not.toContain('010-1234-5678');
    });
  });

  describe('clean text', () => {
    it('returns no findings for clean text', async () => {
      const result = await analyzeOutput('오늘 날씨가 좋습니다');
      expect(result.containsPii).toBe(false);
      expect(result.piiFindings).toHaveLength(0);
      expect(result.sanitizedOutput).toBeUndefined();
    });

    it('returns no findings for normal numbers', async () => {
      const result = await analyzeOutput('총 금액은 15,000원 입니다');
      expect(result.containsPii).toBe(false);
    });
  });

  describe('ML integration', () => {
    it('works without mlRegistry (pattern-only mode)', async () => {
      const result = await analyzeOutput('전화번호: 010-1234-5678', undefined, null);
      expect(result.containsPii).toBe(true);
      expect(result.nerEntities).toBeUndefined();
    });

    it('returns nerEntities as undefined when no ML model', async () => {
      const result = await analyzeOutput('홍길동은 서울에 살고 있습니다');
      expect(result.nerEntities).toBeUndefined();
    });
  });
});
