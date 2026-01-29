import type { OutputAnalysis, PIIFinding, PIIType, NEREntityResult, SensitiveFinding } from '@aegis/common';
import type { ModelRegistry } from '../ml/index.js';
import { detectPIIByNER } from '../ml/index.js';
import {
  SensitiveDataDetector,
  createSensitiveDataDetector,
  maskSensitiveText,
} from './sensitive-data-detector.js';

// Module-level detector (lazy initialized)
let sensitiveDetector: SensitiveDataDetector | null = null;

/**
 * Initializes the sensitive data detector.
 * Call this during application startup.
 */
export const initializeSensitiveDetector = (): void => {
  if (!sensitiveDetector) {
    sensitiveDetector = createSensitiveDataDetector();
  }
};

/**
 * Gets the current sensitive detector instance.
 */
export const getSensitiveDetector = (): SensitiveDataDetector | null => sensitiveDetector;

interface PIIPattern {
  readonly type: PIIType;
  readonly pattern: RegExp;
  readonly maskFormat: string;
}

const piiPatterns: readonly PIIPattern[] = [
  {
    type: 'RRN',
    pattern: /\d{6}-?[1-4]\d{6}/g,
    maskFormat: '******-*******',
  },
  {
    type: 'PHONE',
    pattern: /01[0-9]-?\d{3,4}-?\d{4}/g,
    maskFormat: '***-****-****',
  },
  {
    type: 'EMAIL',
    pattern: /[\w.-]+@[\w.-]+\.\w+/g,
    maskFormat: '***@***.***',
  },
  {
    type: 'CARD',
    pattern: /\d{4}-?\d{4}-?\d{4}-?\d{4}/g,
    maskFormat: '****-****-****-****',
  },
  {
    type: 'ACCOUNT',
    pattern: /\d{3}-\d{2,6}-\d{2,6}/g,
    maskFormat: '***-******-******',
  },
];

const detectPII = (text: string): PIIFinding[] => {
  const findings: PIIFinding[] = [];

  for (const { type, pattern, maskFormat } of piiPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      findings.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 1.0,
        maskedValue: maskFormat,
      });
    }
  }

  return findings;
};

const maskText = (text: string, findings: PIIFinding[]): string => {
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  let result = text;

  for (const finding of sorted) {
    result = result.slice(0, finding.start) + finding.maskedValue + result.slice(finding.end);
  }

  return result;
};

export const analyzeOutput = async (
  output: string,
  _context?: Record<string, unknown>,
  mlRegistry?: ModelRegistry | null,
): Promise<OutputAnalysis> => {
  // Ensure detector is initialized
  if (!sensitiveDetector) {
    initializeSensitiveDetector();
  }

  // Step 1: Pattern-based PII detection
  const piiFindings = detectPII(output);

  // Step 2: Sensitive data detection (credentials, internal info)
  const sensitiveFindings: SensitiveFinding[] = sensitiveDetector
    ? sensitiveDetector.detect(output)
    : [];

  // Step 3: ML NER detection (if available)
  let nerEntities: NEREntityResult[] | undefined;

  if (mlRegistry?.piiDetector) {
    try {
      const entities = await detectPIIByNER(output, mlRegistry.piiDetector);
      if (entities.length > 0) {
        nerEntities = entities.map((e) => ({
          text: e.text,
          type: e.type,
          start: e.start,
          end: e.end,
          confidence: e.confidence,
        }));
      }
    } catch {
      // ML NER failed — fall back to regex-only (graceful degradation)
    }
  }

  // Step 4: Generate policy violations
  const policyViolations: string[] = [];
  for (const f of sensitiveFindings) {
    if (f.category === 'credential') {
      policyViolations.push(`Credential exposure: ${f.description}`);
    } else if (f.category === 'internal') {
      policyViolations.push(`Internal system info exposed: ${f.description}`);
    }
  }

  // Step 5: Mask sensitive data
  const containsPii = piiFindings.length > 0 || (nerEntities !== undefined && nerEntities.length > 0);
  const containsSensitive = sensitiveFindings.length > 0;

  let sanitizedOutput: string | undefined;
  if (piiFindings.length > 0 || sensitiveFindings.length > 0) {
    // First mask PII
    let masked = piiFindings.length > 0 ? maskText(output, piiFindings) : output;
    // Then mask sensitive data (adjust offsets if needed)
    if (sensitiveFindings.length > 0 && piiFindings.length === 0) {
      masked = maskSensitiveText(output, sensitiveFindings);
    } else if (sensitiveFindings.length > 0) {
      // Re-detect sensitive data in PII-masked text to get correct offsets
      const redetected = sensitiveDetector?.detect(masked) ?? [];
      masked = maskSensitiveText(masked, redetected);
    }
    sanitizedOutput = masked;
  }

  return {
    containsPii,
    piiFindings,
    containsSensitive,
    sensitiveFindings,
    policyViolations,
    sanitizedOutput,
    nerEntities,
  };
};
