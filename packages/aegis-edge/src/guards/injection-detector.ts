import type { DetectionResult, ThreatType, RiskLevel } from '@aegis/common';

interface PatternGroup {
  readonly category: ThreatType;
  readonly riskLevel: RiskLevel;
  readonly patterns: RegExp[];
}

const patternGroups: readonly PatternGroup[] = [
  {
    category: 'direct_injection',
    riskLevel: 'critical',
    patterns: [
      /ignore\s+(previous|above|all)\s+(instructions?|prompts?)/i,
      /disregard\s+(previous|above|all)/i,
      /forget\s+(everything|all|previous)/i,
      /새로운\s*지시/,
      /이전\s*(지시|명령).*무시/,
      /시스템\s*프롬프트.*알려/,
    ],
  },
  {
    category: 'jailbreak',
    riskLevel: 'critical',
    patterns: [
      /DAN\s*mode/i,
      /developer\s*mode/i,
      /jailbreak/i,
      /bypass\s*(filter|safety|restriction)/i,
      /pretend\s*you\s*are/i,
      /역할극.*제한/,
      /제한.*해제/,
    ],
  },
  {
    category: 'data_exfiltration',
    riskLevel: 'high',
    patterns: [
      /repeat\s*(everything|all|previous)/i,
      /show\s*(system|initial)\s*prompt/i,
      /what\s*are\s*your\s*instructions/i,
      /출력.*전체/,
      /프롬프트.*보여/,
    ],
  },
];

const createNoDetection = (): DetectionResult => ({
  detected: false,
  type: null,
  confidence: 0,
  matchedPatterns: [],
  riskLevel: 'low',
});

export const detectInjection = (input: string): DetectionResult => {
  for (const group of patternGroups) {
    const matched: string[] = [];
    for (const pattern of group.patterns) {
      const match = input.match(pattern);
      if (match) {
        matched.push(match[0]);
      }
    }
    if (matched.length > 0) {
      return {
        detected: true,
        type: group.category,
        confidence: 1.0,
        matchedPatterns: matched,
        riskLevel: group.riskLevel,
      };
    }
  }
  return createNoDetection();
};
