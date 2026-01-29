import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import pino from 'pino';
import type { PolicyConfig, PolicyRule, DetectionResult, IntentType } from '@aegis/common';
import type { PolicyRepo } from '../db/policy-repo.js';
import type { SemanticAnalyzer } from '../ml/semantic-analyzer.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

interface RawYamlPolicy {
  version: string;
  rules: Array<{
    id: string;
    name: string;
    description?: string;
    category?: string;
    severity?: string;
    action?: string;
    isActive?: boolean;
    priority?: number;
    patterns?: Array<{
      type: string;
      value: string;
      flags?: string;
    }>;
  }>;
}

export interface PolicyStore {
  getConfig(): PolicyConfig;
  getRules(): PolicyRule[];
  addRule(rule: PolicyRule): void;
  updateRule(id: string, updates: Partial<Omit<PolicyRule, 'id'>>): PolicyRule | null;
  deleteRule(id: string): boolean;
  loadFromDb(): Promise<void>;
}

const parseYamlFile = (filePath: string): PolicyRule[] => {
  const rules: PolicyRule[] = [];
  if (!fs.existsSync(filePath)) return rules;

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content) as RawYamlPolicy;

  for (const rule of parsed.rules) {
    rules.push({
      id: rule.id,
      name: rule.name,
      description: rule.description ?? '',
      category: (rule.category ?? 'direct_injection') as PolicyRule['category'],
      severity: (rule.severity ?? 'medium') as PolicyRule['severity'],
      action: (rule.action ?? 'block') as PolicyRule['action'],
      isActive: rule.isActive ?? true,
      priority: rule.priority ?? 100,
      patterns: (rule.patterns ?? []).map((p) => ({
        type: 'regex' as const,
        value: p.value,
        flags: p.flags,
      })),
    });
  }

  return rules;
};

export const createPolicyStore = (rulesDir: string, policyRepo?: PolicyRepo): PolicyStore => {
  const rules: PolicyRule[] = [];

  const injectionPath = path.join(rulesDir, 'injection.yaml');
  rules.push(...parseYamlFile(injectionPath));

  const ragInjectionPath = path.join(rulesDir, 'rag-injection.yaml');
  rules.push(...parseYamlFile(ragInjectionPath));

  rules.sort((a, b) => b.priority - a.priority);

  return {
    getConfig(): PolicyConfig {
      return { version: '1.0', rules: [...rules] };
    },

    getRules(): PolicyRule[] {
      return [...rules];
    },

    addRule(rule: PolicyRule): void {
      rules.push(rule);
      rules.sort((a, b) => b.priority - a.priority);
      if (policyRepo) {
        policyRepo.create(rule).catch((err) => logger.error({ err }, 'Failed to save rule to DB'));
      }
    },

    updateRule(id: string, updates: Partial<Omit<PolicyRule, 'id'>>): PolicyRule | null {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx === -1) return null;

      const updated: PolicyRule = { ...rules[idx], ...updates, id };
      rules[idx] = updated;
      rules.sort((a, b) => b.priority - a.priority);
      if (policyRepo) {
        policyRepo.update(id, updates as Partial<PolicyRule>).catch((err) =>
          logger.error({ err }, 'Failed to update rule in DB'),
        );
      }
      return updated;
    },

    deleteRule(id: string): boolean {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      rules.splice(idx, 1);
      if (policyRepo) {
        policyRepo.remove(id).catch((err) => logger.error({ err }, 'Failed to delete rule from DB'));
      }
      return true;
    },

    async loadFromDb(): Promise<void> {
      if (!policyRepo) return;
      try {
        const dbRules = await policyRepo.findAll();
        if (dbRules.length > 0) {
          rules.length = 0;
          rules.push(...dbRules);
          rules.sort((a, b) => b.priority - a.priority);
          logger.info(`Loaded ${dbRules.length} policy rules from database`);
        } else {
          for (const rule of rules) {
            await policyRepo.create(rule);
          }
          logger.info(`Seeded ${rules.length} YAML rules to database`);
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to load policies from DB, using YAML fallback');
      }
    },
  };
};

export const loadPolicies = (rulesDir: string): PolicyConfig => {
  return createPolicyStore(rulesDir).getConfig();
};

export const evaluatePolicy = (input: string, policies: PolicyConfig): DetectionResult[] => {
  const findings: DetectionResult[] = [];

  for (const rule of policies.rules) {
    if (!rule.isActive) continue;

    const matched: string[] = [];
    for (const pattern of rule.patterns) {
      // Only handle regex patterns for now
      // Semantic patterns require async SemanticAnalyzer integration
      if (pattern.type === 'regex') {
        const regex = new RegExp(pattern.value, pattern.flags ?? '');
        const match = input.match(regex);
        if (match) {
          matched.push(match[0]);
        }
      }
      // Note: 'semantic' type patterns are handled by evaluatePolicyAsync
    }

    if (matched.length > 0) {
      findings.push({
        detected: true,
        type: rule.category,
        confidence: 1.0,
        matchedPatterns: matched,
        riskLevel: rule.severity,
      });
    }
  }

  return findings;
};

/**
 * Evaluates policies with semantic pattern support.
 * Use this when SemanticAnalyzer is available.
 */
export const evaluatePolicyAsync = async (
  input: string,
  policies: PolicyConfig,
  semanticAnalyzer?: SemanticAnalyzer | null,
): Promise<DetectionResult[]> => {
  const findings: DetectionResult[] = [];

  for (const rule of policies.rules) {
    if (!rule.isActive) continue;

    const matched: string[] = [];

    for (const pattern of rule.patterns) {
      if (pattern.type === 'regex') {
        // Regex pattern evaluation
        const regex = new RegExp(pattern.value, pattern.flags ?? '');
        const match = input.match(regex);
        if (match) {
          matched.push(match[0]);
        }
      } else if (pattern.type === 'semantic' && semanticAnalyzer) {
        // Semantic pattern evaluation
        try {
          const result = await semanticAnalyzer.analyze(input);
          const threshold = pattern.similarityThreshold ?? 0.7;

          if (
            result.intent === pattern.intent &&
            result.confidence >= threshold
          ) {
            matched.push(`semantic:${pattern.intent}:${result.confidence.toFixed(2)}`);
          }
        } catch {
          // Semantic analysis failed — skip this pattern
        }
      }
    }

    if (matched.length > 0) {
      findings.push({
        detected: true,
        type: rule.category,
        confidence: 1.0,
        matchedPatterns: matched,
        riskLevel: rule.severity,
      });
    }
  }

  return findings;
};
