/**
 * Advanced Policy Engine
 *
 * Provides advanced policy evaluation features:
 * - ML-based rule evaluation
 * - Composite patterns with logical operators (AND/OR/NOT)
 * - Dynamic policy updates (hot reload)
 * - Policy version management and rollback
 */

import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import type {
  PolicyConfig,
  PolicyRule,
  PatternConfig,
  DetectionResult,
  MLPatternConfig,
  CompositePatternConfig,
  PolicyVersion,
} from '@aegis/common';
import type { ModelRegistry } from '../ml/index.js';
import type { SemanticAnalyzer } from '../ml/semantic-analyzer.js';
import type { PolicyRepo } from '../db/policy-repo.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// ============================================
// Types
// ============================================

export interface PatternEvalResult {
  matched: boolean;
  matchedText?: string;
  confidence: number;
}

export interface AdvancedPolicyStore {
  // Basic operations
  getConfig(): PolicyConfig;
  getRules(): PolicyRule[];
  addRule(rule: PolicyRule): void;
  updateRule(id: string, updates: Partial<Omit<PolicyRule, 'id'>>): PolicyRule | null;
  deleteRule(id: string): boolean;

  // Dynamic updates
  reload(): Promise<void>;
  onUpdate(callback: (rules: PolicyRule[]) => void): void;

  // Version management
  getVersions(): PolicyVersion[];
  createVersion(description?: string, createdBy?: string): PolicyVersion;
  rollback(versionId: string): boolean;
  getVersion(versionId: string): PolicyVersion | undefined;
}

// ============================================
// Pattern Evaluation
// ============================================

/**
 * Evaluate a regex pattern
 */
const evaluateRegexPattern = (
  input: string,
  value: string,
  flags?: string,
): PatternEvalResult => {
  try {
    const regex = new RegExp(value, flags ?? 'i');
    const match = input.match(regex);
    if (match) {
      return { matched: true, matchedText: match[0], confidence: 1.0 };
    }
  } catch (err) {
    logger.warn({ err, pattern: value }, 'Invalid regex pattern');
  }
  return { matched: false, confidence: 0 };
};

/**
 * Evaluate a semantic pattern
 */
const evaluateSemanticPattern = async (
  input: string,
  pattern: PatternConfig,
  semanticAnalyzer?: SemanticAnalyzer | null,
): Promise<PatternEvalResult> => {
  if (pattern.type !== 'semantic' || !semanticAnalyzer) {
    return { matched: false, confidence: 0 };
  }

  try {
    const result = await semanticAnalyzer.analyze(input);
    const threshold = pattern.similarityThreshold ?? 0.7;

    if (result.intent === pattern.intent && result.confidence >= threshold) {
      return {
        matched: true,
        matchedText: `semantic:${pattern.intent}`,
        confidence: result.confidence,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Semantic analysis failed');
  }

  return { matched: false, confidence: 0 };
};

/**
 * Evaluate an ML pattern
 */
const evaluateMLPattern = async (
  input: string,
  pattern: MLPatternConfig,
  mlRegistry?: ModelRegistry | null,
): Promise<PatternEvalResult> => {
  if (!mlRegistry) {
    return { matched: false, confidence: 0 };
  }

  try {
    if (pattern.modelName === 'injection_classifier' && mlRegistry.injectionClassifier) {
      const { classifyInjection } = await import('../ml/index.js');
      const result = await classifyInjection(input, mlRegistry.injectionClassifier);

      if (result) {
        const targetLabels = pattern.targetLabels ?? ['direct_injection', 'indirect_injection', 'jailbreak'];
        const isTargetLabel = targetLabels.includes(result.label);
        const meetsThreshold = result.confidence >= pattern.threshold;

        if (isTargetLabel && meetsThreshold) {
          return {
            matched: true,
            matchedText: `ml:${result.label}`,
            confidence: result.confidence,
          };
        }
      }
    }

    if (pattern.modelName === 'pii_detector' && mlRegistry.piiDetector) {
      const { detectPIIByNER } = await import('../ml/index.js');
      const entities = await detectPIIByNER(input, mlRegistry.piiDetector);

      if (entities.length > 0) {
        const targetLabels = pattern.targetLabels ?? ['PER', 'LOC', 'ORG'];
        const matchedEntities = entities.filter(
          (e) => targetLabels.includes(e.type) && e.confidence >= pattern.threshold,
        );

        if (matchedEntities.length > 0) {
          const topEntity = matchedEntities.reduce((a, b) =>
            a.confidence > b.confidence ? a : b,
          );
          return {
            matched: true,
            matchedText: `ml:${topEntity.type}:${topEntity.text}`,
            confidence: topEntity.confidence,
          };
        }
      }
    }
  } catch (err) {
    logger.warn({ err, model: pattern.modelName }, 'ML evaluation failed');
  }

  return { matched: false, confidence: 0 };
};

/**
 * Evaluate a composite pattern with logical operators
 */
const evaluateCompositePattern = async (
  input: string,
  pattern: CompositePatternConfig,
  mlRegistry?: ModelRegistry | null,
  semanticAnalyzer?: SemanticAnalyzer | null,
): Promise<PatternEvalResult> => {
  const results: PatternEvalResult[] = [];

  for (const condition of pattern.conditions) {
    const result = await evaluatePatternAsync(input, condition, mlRegistry, semanticAnalyzer);
    results.push(result);
  }

  switch (pattern.operator) {
    case 'AND': {
      const allMatched = results.every((r) => r.matched);
      if (allMatched) {
        const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
        const matchedTexts = results
          .filter((r) => r.matchedText)
          .map((r) => r.matchedText)
          .join(' AND ');
        return { matched: true, matchedText: matchedTexts, confidence: avgConfidence };
      }
      return { matched: false, confidence: 0 };
    }

    case 'OR': {
      const anyMatched = results.find((r) => r.matched);
      if (anyMatched) {
        return anyMatched;
      }
      return { matched: false, confidence: 0 };
    }

    case 'NOT': {
      // NOT operator: true if first condition is NOT matched
      if (results.length > 0 && !results[0].matched) {
        return { matched: true, matchedText: 'NOT:matched', confidence: 1.0 };
      }
      return { matched: false, confidence: 0 };
    }

    default:
      return { matched: false, confidence: 0 };
  }
};

/**
 * Evaluate a single pattern (async)
 */
export const evaluatePatternAsync = async (
  input: string,
  pattern: PatternConfig,
  mlRegistry?: ModelRegistry | null,
  semanticAnalyzer?: SemanticAnalyzer | null,
): Promise<PatternEvalResult> => {
  switch (pattern.type) {
    case 'regex':
      return evaluateRegexPattern(input, pattern.value, pattern.flags);

    case 'semantic':
      return evaluateSemanticPattern(input, pattern, semanticAnalyzer);

    case 'ml':
      return evaluateMLPattern(input, pattern, mlRegistry);

    case 'composite':
      return evaluateCompositePattern(input, pattern, mlRegistry, semanticAnalyzer);

    default:
      return { matched: false, confidence: 0 };
  }
};

// ============================================
// Advanced Policy Evaluation
// ============================================

/**
 * Evaluate policies with full feature support (ML, semantic, composite)
 */
export const evaluatePolicyAdvanced = async (
  input: string,
  policies: PolicyConfig,
  mlRegistry?: ModelRegistry | null,
  semanticAnalyzer?: SemanticAnalyzer | null,
): Promise<DetectionResult[]> => {
  const findings: DetectionResult[] = [];

  for (const rule of policies.rules) {
    if (!rule.isActive) continue;

    const matched: string[] = [];
    let maxConfidence = 0;

    for (const pattern of rule.patterns) {
      const result = await evaluatePatternAsync(input, pattern, mlRegistry, semanticAnalyzer);

      if (result.matched) {
        matched.push(result.matchedText ?? 'unknown');
        maxConfidence = Math.max(maxConfidence, result.confidence);
      }
    }

    if (matched.length > 0) {
      findings.push({
        detected: true,
        type: rule.category,
        confidence: maxConfidence,
        matchedPatterns: matched,
        riskLevel: rule.severity,
      });
    }
  }

  return findings;
};

// ============================================
// Advanced Policy Store
// ============================================

export const createAdvancedPolicyStore = (
  initialRules: PolicyRule[] = [],
  policyRepo?: PolicyRepo,
): AdvancedPolicyStore => {
  let rules: PolicyRule[] = [...initialRules];
  const versions: PolicyVersion[] = [];
  const updateCallbacks: ((rules: PolicyRule[]) => void)[] = [];

  // Create initial version
  const createInitialVersion = (): void => {
    if (rules.length > 0) {
      versions.push({
        versionId: uuidv4(),
        version: 1,
        rules: [...rules],
        createdAt: new Date().toISOString(),
        description: 'Initial version',
      });
    }
  };

  createInitialVersion();

  const notifyUpdate = (): void => {
    for (const callback of updateCallbacks) {
      try {
        callback([...rules]);
      } catch (err) {
        logger.error({ err }, 'Update callback failed');
      }
    }
  };

  return {
    getConfig(): PolicyConfig {
      return { version: '1.0', rules: [...rules] };
    },

    getRules(): PolicyRule[] {
      return [...rules];
    },

    addRule(rule: PolicyRule): void {
      const now = new Date().toISOString();
      const newRule: PolicyRule = {
        ...rule,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      rules.push(newRule);
      rules.sort((a, b) => b.priority - a.priority);

      if (policyRepo) {
        policyRepo.create(newRule).catch((err) =>
          logger.error({ err }, 'Failed to save rule to DB'),
        );
      }

      notifyUpdate();
    },

    updateRule(id: string, updates: Partial<Omit<PolicyRule, 'id'>>): PolicyRule | null {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx === -1) return null;

      const existing = rules[idx];
      const updated: PolicyRule = {
        ...existing,
        ...updates,
        id,
        version: (existing.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };

      rules[idx] = updated;
      rules.sort((a, b) => b.priority - a.priority);

      if (policyRepo) {
        policyRepo.update(id, updates as Partial<PolicyRule>).catch((err) =>
          logger.error({ err }, 'Failed to update rule in DB'),
        );
      }

      notifyUpdate();
      return updated;
    },

    deleteRule(id: string): boolean {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx === -1) return false;

      rules.splice(idx, 1);

      if (policyRepo) {
        policyRepo.remove(id).catch((err) =>
          logger.error({ err }, 'Failed to delete rule from DB'),
        );
      }

      notifyUpdate();
      return true;
    },

    async reload(): Promise<void> {
      if (!policyRepo) {
        logger.warn('No policy repo configured, cannot reload');
        return;
      }

      try {
        const dbRules = await policyRepo.findAll();
        rules = dbRules;
        rules.sort((a, b) => b.priority - a.priority);
        logger.info(`Reloaded ${rules.length} policy rules from database`);
        notifyUpdate();
      } catch (err) {
        logger.error({ err }, 'Failed to reload policies from DB');
        throw err;
      }
    },

    onUpdate(callback: (rules: PolicyRule[]) => void): void {
      updateCallbacks.push(callback);
    },

    getVersions(): PolicyVersion[] {
      return [...versions].sort((a, b) => b.version - a.version);
    },

    createVersion(description?: string, createdBy?: string): PolicyVersion {
      const latestVersion = versions.length > 0
        ? Math.max(...versions.map((v) => v.version))
        : 0;

      const newVersion: PolicyVersion = {
        versionId: uuidv4(),
        version: latestVersion + 1,
        rules: rules.map((r) => ({ ...r })),
        createdAt: new Date().toISOString(),
        createdBy,
        description,
      };

      versions.push(newVersion);
      logger.info({ version: newVersion.version, description }, 'Created policy version');

      return newVersion;
    },

    rollback(versionId: string): boolean {
      const version = versions.find((v) => v.versionId === versionId);
      if (!version) {
        logger.warn({ versionId }, 'Version not found for rollback');
        return false;
      }

      // Create a new version before rollback (for audit trail)
      this.createVersion(`Pre-rollback snapshot (rolling back to v${version.version})`);

      // Apply the rollback
      rules = version.rules.map((r) => ({ ...r }));
      rules.sort((a, b) => b.priority - a.priority);

      // Sync to DB if available
      if (policyRepo) {
        (async () => {
          try {
            // Remove all existing rules
            const existingRules = await policyRepo.findAll();
            for (const rule of existingRules) {
              await policyRepo.remove(rule.id);
            }
            // Add rules from version
            for (const rule of rules) {
              await policyRepo.create(rule);
            }
            logger.info({ versionId, version: version.version }, 'Rollback synced to DB');
          } catch (err) {
            logger.error({ err }, 'Failed to sync rollback to DB');
          }
        })();
      }

      logger.info({ versionId, version: version.version }, 'Rolled back to version');
      notifyUpdate();
      return true;
    },

    getVersion(versionId: string): PolicyVersion | undefined {
      return versions.find((v) => v.versionId === versionId);
    },
  };
};

// ============================================
// Policy Change Event Types
// ============================================

export type PolicyChangeType = 'add' | 'update' | 'delete' | 'reload' | 'rollback';

export interface PolicyChangeEvent {
  type: PolicyChangeType;
  ruleId?: string;
  timestamp: string;
  oldValue?: PolicyRule;
  newValue?: PolicyRule;
}

/**
 * Create a policy change tracker
 */
export const createPolicyChangeTracker = () => {
  const events: PolicyChangeEvent[] = [];
  const maxEvents = 1000;

  return {
    track(event: Omit<PolicyChangeEvent, 'timestamp'>): void {
      events.push({
        ...event,
        timestamp: new Date().toISOString(),
      });

      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
    },

    getEvents(limit?: number): PolicyChangeEvent[] {
      const sorted = [...events].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      return limit ? sorted.slice(0, limit) : sorted;
    },

    clear(): void {
      events.length = 0;
    },
  };
};
