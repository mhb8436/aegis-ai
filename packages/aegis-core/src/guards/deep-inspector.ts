import type { InspectRequest, InspectionResult, DetectionResult, ThreatType, RiskLevel, IntentType } from '@aegis/common';
import type { ModelRegistry } from '../ml/index.js';
import { classifyInjection } from '../ml/index.js';
import { SemanticAnalyzer, createPatternSemanticAnalyzer } from '../ml/semantic-analyzer.js';
import { ContextAnalyzer, createContextAnalyzer } from './context-analyzer.js';

// Module-level analyzers (lazy initialized)
let semanticAnalyzer: SemanticAnalyzer | null = null;
let contextAnalyzer: ContextAnalyzer | null = null;

/**
 * Initializes semantic and context analyzers.
 * Call this during application startup.
 */
export const initializeAnalyzers = (): void => {
  if (!semanticAnalyzer) {
    semanticAnalyzer = createPatternSemanticAnalyzer({ minConfidence: 0.5 });
  }
  if (!contextAnalyzer) {
    contextAnalyzer = createContextAnalyzer(semanticAnalyzer);
  }
};

/**
 * Maps IntentType to ThreatType.
 */
const mapIntentToThreatType = (intent: IntentType): ThreatType => {
  const mapping: Record<IntentType, ThreatType> = {
    override_instructions: 'direct_injection',
    exfiltrate_data: 'data_exfiltration',
    jailbreak_attempt: 'jailbreak',
    role_manipulation: 'direct_injection',
    context_confusion: 'indirect_injection',
    gradual_escalation: 'indirect_injection',
    benign: 'prompt_injection', // fallback, won't be used
  };
  return mapping[intent];
};

/**
 * Maps IntentType to RiskLevel.
 */
const mapIntentToRiskLevel = (intent: IntentType, confidence: number): RiskLevel => {
  const baseRisk: Record<IntentType, RiskLevel> = {
    benign: 'low',
    context_confusion: 'medium',
    role_manipulation: 'medium',
    gradual_escalation: 'high',
    override_instructions: 'high',
    exfiltrate_data: 'high',
    jailbreak_attempt: 'critical',
  };

  const risk = baseRisk[intent];
  // Upgrade risk level if confidence is very high
  if (confidence >= 0.9 && risk !== 'critical') {
    return risk === 'high' ? 'critical' : 'high';
  }
  return risk;
};

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
      /override\s+(system|previous)\s*(prompt|instructions?)/i,
      /you\s+are\s+now\s+a/i,
      /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
      /새로운\s*지시/,
      /이전\s*(지시|명령).*무시/,
      /시스템\s*프롬프트.*알려/,
      /지시.*변경/,
      /명령.*초기화/,
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
      /you\s+have\s+been\s+freed/i,
      /enable\s+unrestricted\s+mode/i,
      /역할극.*제한/,
      /제한.*해제/,
      /필터.*우회/,
    ],
  },
  {
    category: 'data_exfiltration',
    riskLevel: 'high',
    patterns: [
      /repeat\s*(everything|all|previous)/i,
      /show\s*(system|initial)\s*prompt/i,
      /what\s*are\s*your\s*instructions/i,
      /print\s*(your|the)\s*(system|initial)\s*(prompt|message)/i,
      /reveal\s*(your|the)\s*(system|hidden)\s*(prompt|instructions?)/i,
      /출력.*전체/,
      /프롬프트.*보여/,
      /내부\s*정보.*알려/,
      /비밀.*알려/,
    ],
  },
];

const detectPatterns = (input: string): DetectionResult[] => {
  const findings: DetectionResult[] = [];

  for (const group of patternGroups) {
    const matched: string[] = [];
    for (const pattern of group.patterns) {
      const match = input.match(pattern);
      if (match) {
        matched.push(match[0]);
      }
    }
    if (matched.length > 0) {
      findings.push({
        detected: true,
        type: group.category,
        confidence: Math.min(1.0, 0.7 + matched.length * 0.1),
        matchedPatterns: matched,
        riskLevel: group.riskLevel,
      });
    }
  }

  return findings;
};

const calculateRiskScore = (findings: DetectionResult[]): number => {
  if (findings.length === 0) return 0;

  const weights: Record<RiskLevel, number> = {
    low: 0.1,
    medium: 0.4,
    high: 0.9,
    critical: 1.0,
  };

  const maxScore = Math.max(
    ...findings.map((f) => f.confidence * weights[f.riskLevel]),
  );

  return Math.min(1.0, maxScore);
};

export const deepInspect = async (
  request: InspectRequest,
  mlRegistry?: ModelRegistry | null,
): Promise<InspectionResult> => {
  const startTime = Date.now();

  // Ensure analyzers are initialized
  if (!semanticAnalyzer) {
    initializeAnalyzers();
  }

  let fullInput = request.message;
  if (request.conversationHistory && request.conversationHistory.length > 0) {
    fullInput = [...request.conversationHistory, request.message].join('\n');
  }

  // Step 1: Pattern-based detection
  const findings: DetectionResult[] = detectPatterns(fullInput);
  let riskScore = calculateRiskScore(findings);

  // Step 2: Semantic analysis (intent detection)
  if (semanticAnalyzer && request.enableSemantic !== false) {
    try {
      const semanticResult = await semanticAnalyzer.analyze(request.message);

      if (semanticResult.detected && semanticResult.intent !== 'benign') {
        const semanticRiskLevel = mapIntentToRiskLevel(semanticResult.intent, semanticResult.confidence);

        findings.push({
          detected: true,
          type: mapIntentToThreatType(semanticResult.intent),
          confidence: semanticResult.confidence,
          matchedPatterns: [`semantic:${semanticResult.intent}`, ...semanticResult.topMatches.map(m => m.referenceName)],
          riskLevel: semanticRiskLevel,
        });

        // Semantic analysis can only increase risk score
        riskScore = Math.max(riskScore, semanticResult.confidence);
      }
    } catch {
      // Semantic analysis failed — continue with other checks
    }
  }

  // Step 3: Context analysis (multi-turn detection)
  if (contextAnalyzer && request.sessionId && request.enableContext !== false) {
    try {
      const contextResult = await contextAnalyzer.analyze(
        request.sessionId,
        request.message,
        request.conversationHistory,
      );

      if (contextResult.cumulativeRiskScore >= 0.6 && contextResult.detectedPatterns.length > 0) {
        findings.push({
          detected: true,
          type: 'indirect_injection',
          confidence: contextResult.cumulativeRiskScore,
          matchedPatterns: contextResult.detectedPatterns.map(p => `context:${p}`),
          riskLevel: contextResult.cumulativeRiskScore >= 0.8 ? 'high' : 'medium',
        });

        // Context analysis can only increase risk score
        riskScore = Math.max(riskScore, contextResult.cumulativeRiskScore);
      }
    } catch {
      // Context analysis failed — continue with other checks
    }
  }

  // Step 4: ML classification (if available)
  if (mlRegistry?.injectionClassifier) {
    try {
      const mlResult = await classifyInjection(fullInput, mlRegistry.injectionClassifier);

      if (mlResult.label !== 'normal' && mlResult.confidence >= mlRegistry.injectionClassifier.config.threshold) {
        const mlThreatType = mlResult.label as ThreatType;
        const mlRiskScore = mlResult.confidence;

        findings.push({
          detected: true,
          type: mlThreatType,
          confidence: mlResult.confidence,
          matchedPatterns: [`ml:${mlResult.label}`],
          riskLevel: mlResult.confidence >= 0.9 ? 'critical' : mlResult.confidence >= 0.7 ? 'high' : 'medium',
          mlClassification: {
            label: mlResult.label,
            confidence: mlResult.confidence,
            probabilities: mlResult.probabilities,
            modelName: mlRegistry.injectionClassifier.config.name,
          },
        });

        // ML can only increase risk score, never decrease
        riskScore = Math.max(riskScore, mlRiskScore);
      }
    } catch {
      // ML inference failed — fall back to pattern-only (graceful degradation)
    }
  }

  return {
    passed: riskScore < 0.7,
    findings,
    riskScore,
    latencyMs: Date.now() - startTime,
  };
};

/**
 * Gets the current context analyzer instance.
 * Useful for session management.
 */
export const getContextAnalyzer = (): ContextAnalyzer | null => contextAnalyzer;

/**
 * Gets the current semantic analyzer instance.
 */
export const getSemanticAnalyzer = (): SemanticAnalyzer | null => semanticAnalyzer;
