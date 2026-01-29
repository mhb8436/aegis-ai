export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ThreatType =
  | 'direct_injection'
  | 'indirect_injection'
  | 'jailbreak'
  | 'data_exfiltration'
  | 'pii_leak'
  | 'tool_abuse'
  | 'hidden_directive'
  | 'invisible_characters'
  | 'encoding_attack'
  | 'prompt_injection';

export type DetectionAction = 'allow' | 'block' | 'warn';

export interface MLClassification {
  readonly label: string;
  readonly confidence: number;
  readonly probabilities?: Record<string, number>;
  readonly modelName: string;
}

export interface DetectionResult {
  readonly detected: boolean;
  readonly type: ThreatType | null;
  readonly confidence: number;
  readonly matchedPatterns: string[];
  readonly riskLevel: RiskLevel;
  readonly mlClassification?: MLClassification;
}

export interface PatternMatch {
  readonly patternId: string;
  readonly category: string;
  readonly matched: string;
  readonly position: { start: number; end: number };
}

export interface InspectionResult {
  readonly passed: boolean;
  readonly findings: DetectionResult[];
  readonly riskScore: number;
  readonly latencyMs: number;
}

export type PIIType = 'RRN' | 'PHONE' | 'EMAIL' | 'CARD' | 'ACCOUNT';

export interface PIIFinding {
  readonly type: PIIType;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly confidence: number;
  readonly maskedValue: string;
}

export interface NEREntityResult {
  readonly text: string;
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly confidence: number;
}

// ============================================
// Sensitive Data Types
// ============================================

export type SensitiveType =
  // Credentials
  | 'API_KEY'
  | 'ACCESS_TOKEN'
  | 'AWS_CREDENTIAL'
  | 'JWT_TOKEN'
  | 'PRIVATE_KEY'
  | 'DB_CONNECTION'
  | 'PASSWORD'
  // Internal Systems
  | 'INTERNAL_URL'
  | 'INTERNAL_PATH'
  | 'ENV_VARIABLE'
  // Custom
  | 'CUSTOM';

export type SensitiveCategory = 'credential' | 'internal' | 'custom';

export interface SensitiveFinding {
  readonly type: SensitiveType;
  readonly category: SensitiveCategory;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly confidence: number;
  readonly description: string;
  readonly maskedValue: string;
}

export interface OutputAnalysis {
  readonly containsPii: boolean;
  readonly piiFindings: PIIFinding[];
  readonly containsSensitive: boolean;
  readonly sensitiveFindings: SensitiveFinding[];
  readonly policyViolations: string[];
  readonly sanitizedOutput?: string;
  readonly nerEntities?: NEREntityResult[];
}

// ============================================
// Semantic Analysis Types
// ============================================

export type IntentType =
  | 'override_instructions'
  | 'exfiltrate_data'
  | 'jailbreak_attempt'
  | 'role_manipulation'
  | 'context_confusion'
  | 'gradual_escalation'
  | 'benign';

export interface SemanticMatch {
  readonly referenceId: string;
  readonly referenceName: string;
  readonly similarity: number;
  readonly intentType: IntentType;
}

export interface SemanticResult {
  readonly detected: boolean;
  readonly intent: IntentType;
  readonly confidence: number;
  readonly topMatches: SemanticMatch[];
}

// ============================================
// Context Analysis Types
// ============================================

export interface ContextDriftMetrics {
  readonly intentShift: number;
  readonly topicCoherence: number;
  readonly escalationScore: number;
}

export interface ContextResult {
  readonly turnCount: number;
  readonly detectedPatterns: string[];
  readonly cumulativeRiskScore: number;
  readonly drift: ContextDriftMetrics;
  readonly trajectory: IntentType[];
}
