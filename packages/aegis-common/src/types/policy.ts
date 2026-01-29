import type { RiskLevel, ThreatType, DetectionAction, IntentType } from './detection.js';

export type PatternType = 'regex' | 'semantic' | 'ml' | 'composite';

export interface RegexPatternConfig {
  readonly type: 'regex';
  readonly value: string;
  readonly flags?: string;
}

export interface SemanticPatternConfig {
  readonly type: 'semantic';
  readonly intent: IntentType;
  readonly similarityThreshold: number;
  readonly referenceTexts?: string[];
}

/**
 * ML-based pattern configuration
 */
export interface MLPatternConfig {
  readonly type: 'ml';
  readonly modelName: 'injection_classifier' | 'pii_detector';
  readonly threshold: number;
  readonly targetLabels?: string[];
}

/**
 * Composite pattern with logical operators
 */
export type LogicalOperator = 'AND' | 'OR' | 'NOT';

export interface CompositePatternConfig {
  readonly type: 'composite';
  readonly operator: LogicalOperator;
  readonly conditions: PatternConfig[];
}

export type PatternConfig =
  | RegexPatternConfig
  | SemanticPatternConfig
  | MLPatternConfig
  | CompositePatternConfig;

export interface PolicyRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ThreatType;
  readonly severity: RiskLevel;
  readonly action: DetectionAction;
  readonly patterns: PatternConfig[];
  readonly isActive: boolean;
  readonly priority: number;
  readonly version?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * Policy version snapshot for rollback support
 */
export interface PolicyVersion {
  readonly versionId: string;
  readonly version: number;
  readonly rules: PolicyRule[];
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly description?: string;
}

export interface PolicyConfig {
  readonly version: string;
  readonly rules: PolicyRule[];
}

export interface PIIPolicyRule {
  readonly id: string;
  readonly name: string;
  readonly pattern: string;
  readonly action: 'mask' | 'block' | 'warn';
  readonly maskFormat?: string;
  readonly isActive: boolean;
}
