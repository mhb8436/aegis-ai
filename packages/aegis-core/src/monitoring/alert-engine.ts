/**
 * Alert Rule Engine
 *
 * Evaluates metric-based alert rules and triggers notifications.
 * Supports threshold-based alerts with configurable conditions.
 */

// ============================================
// Types
// ============================================

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertCondition = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export type MetricType =
  | 'block_rate'
  | 'threat_count'
  | 'avg_latency'
  | 'error_rate'
  | 'pii_count'
  | 'sensitive_count'
  | 'ml_error_rate'
  | 'active_sessions';

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly metric: MetricType;
  readonly condition: AlertCondition;
  readonly threshold: number;
  readonly windowSeconds: number;
  readonly severity: AlertSeverity;
  readonly enabled: boolean;
  readonly cooldownSeconds: number;
  readonly labels?: Record<string, string>;
}

export interface Alert {
  readonly id: string;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly currentValue: number;
  readonly threshold: number;
  readonly firedAt: Date;
  readonly labels?: Record<string, string>;
}

export interface AlertHandler {
  (alert: Alert): Promise<void>;
}

export interface MetricSnapshot {
  readonly totalRequests: number;
  readonly blockedRequests: number;
  readonly totalLatencyMs: number;
  readonly errorCount: number;
  readonly piiCount: number;
  readonly sensitiveCount: number;
  readonly threatCount: number;
  readonly mlErrors: number;
  readonly activeSessions: number;
}

// ============================================
// Default Alert Rules
// ============================================

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'high-block-rate',
    name: 'High Block Rate',
    description: 'Block rate exceeds 10%',
    metric: 'block_rate',
    condition: 'gt',
    threshold: 0.1,
    windowSeconds: 300, // 5 minutes
    severity: 'warning',
    enabled: true,
    cooldownSeconds: 600, // 10 minutes
  },
  {
    id: 'critical-block-rate',
    name: 'Critical Block Rate',
    description: 'Block rate exceeds 30%',
    metric: 'block_rate',
    condition: 'gt',
    threshold: 0.3,
    windowSeconds: 300,
    severity: 'critical',
    enabled: true,
    cooldownSeconds: 300,
  },
  {
    id: 'high-latency',
    name: 'High Latency',
    description: 'Average latency exceeds 1 second',
    metric: 'avg_latency',
    condition: 'gt',
    threshold: 1000,
    windowSeconds: 60, // 1 minute
    severity: 'warning',
    enabled: true,
    cooldownSeconds: 300,
  },
  {
    id: 'critical-latency',
    name: 'Critical Latency',
    description: 'Average latency exceeds 5 seconds',
    metric: 'avg_latency',
    condition: 'gt',
    threshold: 5000,
    windowSeconds: 60,
    severity: 'critical',
    enabled: true,
    cooldownSeconds: 300,
  },
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    description: 'Error rate exceeds 5%',
    metric: 'error_rate',
    condition: 'gt',
    threshold: 0.05,
    windowSeconds: 300,
    severity: 'warning',
    enabled: true,
    cooldownSeconds: 600,
  },
  {
    id: 'threat-spike',
    name: 'Threat Spike',
    description: 'More than 100 threats in window',
    metric: 'threat_count',
    condition: 'gt',
    threshold: 100,
    windowSeconds: 60,
    severity: 'warning',
    enabled: true,
    cooldownSeconds: 300,
  },
  {
    id: 'pii-leak-spike',
    name: 'PII Leak Spike',
    description: 'More than 50 PII detections in window',
    metric: 'pii_count',
    condition: 'gt',
    threshold: 50,
    windowSeconds: 300,
    severity: 'critical',
    enabled: true,
    cooldownSeconds: 600,
  },
  {
    id: 'sensitive-data-spike',
    name: 'Sensitive Data Spike',
    description: 'More than 20 sensitive data detections in window',
    metric: 'sensitive_count',
    condition: 'gt',
    threshold: 20,
    windowSeconds: 300,
    severity: 'warning',
    enabled: true,
    cooldownSeconds: 600,
  },
  {
    id: 'ml-degradation',
    name: 'ML Model Degradation',
    description: 'ML error rate exceeds 10%',
    metric: 'ml_error_rate',
    condition: 'gt',
    threshold: 0.1,
    windowSeconds: 300,
    severity: 'warning',
    enabled: true,
    cooldownSeconds: 900,
  },
];

// ============================================
// Alert Engine Class
// ============================================

export class AlertEngine {
  private rules: Map<string, AlertRule> = new Map();
  private handlers: AlertHandler[] = [];
  private lastFired: Map<string, Date> = new Map();
  private metricHistory: MetricSnapshot[] = [];
  private readonly maxHistorySize = 1000;

  constructor(rules: AlertRule[] = DEFAULT_ALERT_RULES) {
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: AlertHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Add or update a rule
   */
  setRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get all rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.rules.set(ruleId, { ...rule, enabled });
    return true;
  }

  /**
   * Record a metric snapshot
   */
  recordSnapshot(snapshot: MetricSnapshot): void {
    this.metricHistory.push(snapshot);

    // Trim history if too large
    if (this.metricHistory.length > this.maxHistorySize) {
      this.metricHistory = this.metricHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Evaluate all rules against current metrics
   */
  async evaluate(snapshot: MetricSnapshot): Promise<Alert[]> {
    this.recordSnapshot(snapshot);

    const alerts: Alert[] = [];
    const now = new Date();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check cooldown
      const lastFiredTime = this.lastFired.get(rule.id);
      if (lastFiredTime) {
        const cooldownMs = rule.cooldownSeconds * 1000;
        if (now.getTime() - lastFiredTime.getTime() < cooldownMs) {
          continue;
        }
      }

      // Get metric value
      const value = this.getMetricValue(rule.metric, snapshot);
      if (value === null) continue;

      // Check condition
      if (this.checkCondition(value, rule.condition, rule.threshold)) {
        const alert = this.createAlert(rule, value, now);
        alerts.push(alert);
        this.lastFired.set(rule.id, now);

        // Notify handlers
        for (const handler of this.handlers) {
          try {
            await handler(alert);
          } catch (err) {
            console.error(`Alert handler error: ${(err as Error).message}`);
          }
        }
      }
    }

    return alerts;
  }

  /**
   * Get metric value from snapshot
   */
  private getMetricValue(metric: MetricType, snapshot: MetricSnapshot): number | null {
    switch (metric) {
      case 'block_rate':
        return snapshot.totalRequests > 0
          ? snapshot.blockedRequests / snapshot.totalRequests
          : 0;

      case 'threat_count':
        return snapshot.threatCount;

      case 'avg_latency':
        return snapshot.totalRequests > 0
          ? snapshot.totalLatencyMs / snapshot.totalRequests
          : 0;

      case 'error_rate':
        return snapshot.totalRequests > 0
          ? snapshot.errorCount / snapshot.totalRequests
          : 0;

      case 'pii_count':
        return snapshot.piiCount;

      case 'sensitive_count':
        return snapshot.sensitiveCount;

      case 'ml_error_rate':
        return snapshot.totalRequests > 0
          ? snapshot.mlErrors / snapshot.totalRequests
          : 0;

      case 'active_sessions':
        return snapshot.activeSessions;

      default:
        return null;
    }
  }

  /**
   * Check if condition is met
   */
  private checkCondition(
    value: number,
    condition: AlertCondition,
    threshold: number,
  ): boolean {
    switch (condition) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      case 'neq':
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * Create an alert object
   */
  private createAlert(rule: AlertRule, currentValue: number, firedAt: Date): Alert {
    const conditionText = this.getConditionText(rule.condition);

    return {
      id: `${rule.id}-${firedAt.getTime()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.metric} is ${currentValue.toFixed(4)} (${conditionText} ${rule.threshold})`,
      currentValue,
      threshold: rule.threshold,
      firedAt,
      labels: rule.labels,
    };
  }

  /**
   * Get human-readable condition text
   */
  private getConditionText(condition: AlertCondition): string {
    switch (condition) {
      case 'gt':
        return '>';
      case 'gte':
        return '>=';
      case 'lt':
        return '<';
      case 'lte':
        return '<=';
      case 'eq':
        return '==';
      case 'neq':
        return '!=';
      default:
        return condition;
    }
  }

  /**
   * Get recent alerts (last N alerts fired)
   */
  getRecentAlerts(): Map<string, Date> {
    return new Map(this.lastFired);
  }

  /**
   * Clear alert history and cooldowns
   */
  clearHistory(): void {
    this.lastFired.clear();
    this.metricHistory = [];
  }

  /**
   * Get metric history
   */
  getHistory(): MetricSnapshot[] {
    return [...this.metricHistory];
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an alert engine with default rules
 */
export const createAlertEngine = (customRules?: AlertRule[]): AlertEngine => {
  const rules = customRules ?? DEFAULT_ALERT_RULES;
  return new AlertEngine(rules);
};

// ============================================
// Console Alert Handler
// ============================================

/**
 * Simple console handler for testing
 */
export const consoleAlertHandler: AlertHandler = async (alert: Alert): Promise<void> => {
  const severityIcon = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
  };

  console.log(
    `${severityIcon[alert.severity]} [ALERT] ${alert.message}`,
  );
};

// ============================================
// Webhook Alert Handler
// ============================================

export interface WebhookConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
}

/**
 * Create a webhook handler for sending alerts
 */
export const createWebhookHandler = (config: WebhookConfig): AlertHandler => {
  return async (alert: Alert): Promise<void> => {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          alert,
          timestamp: new Date().toISOString(),
          source: 'aegis',
        }),
        signal: AbortSignal.timeout(config.timeout ?? 5000),
      });

      if (!response.ok) {
        console.error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(`Webhook error: ${(err as Error).message}`);
    }
  };
};
