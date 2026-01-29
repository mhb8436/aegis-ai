/**
 * Monitoring Module
 *
 * Provides Prometheus metrics and alert engine for Aegis.
 */

// Metrics
export {
  // Registry
  getMetrics,
  getMetricsContentType,
  getRegistry,
  resetMetrics,
  // Request metrics
  requestsTotal,
  requestDuration,
  recordRequest,
  // Security metrics
  threatsDetected,
  blockedRequests,
  piiDetections,
  sensitiveDetections,
  currentRiskScore,
  recordThreat,
  recordBlocked,
  recordPII,
  recordSensitive,
  // Inspection metrics
  inspectionDuration,
  inspectionsTotal,
  recordInspection,
  // ML metrics
  mlInferenceDuration,
  mlPredictions,
  mlModelAvailable,
  recordMLInference,
  setMLModelAvailable,
  // Policy metrics
  policyEvaluations,
  activePolicies,
  recordPolicyEvaluation,
  // Rate limiting
  rateLimitHits,
  // RAG/Agent metrics
  ragScans,
  agentToolCalls,
  // System metrics
  activeSessions,
  auditLogEntries,
} from './metrics.js';

// Alert Engine
export {
  AlertEngine,
  createAlertEngine,
  consoleAlertHandler,
  createWebhookHandler,
  DEFAULT_ALERT_RULES,
  type AlertRule,
  type Alert,
  type AlertHandler,
  type AlertSeverity,
  type AlertCondition,
  type MetricType,
  type MetricSnapshot,
  type WebhookConfig,
} from './alert-engine.js';
