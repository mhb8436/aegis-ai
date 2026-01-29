/**
 * Prometheus Metrics Service
 *
 * Provides metrics collection for Aegis security platform.
 * Exposes metrics in Prometheus format via /metrics endpoint.
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

// ============================================
// Registry
// ============================================

const register = new Registry();

// Add default Node.js metrics (memory, CPU, event loop, etc.)
collectDefaultMetrics({ register });

// ============================================
// Request Metrics
// ============================================

/**
 * Total requests counter by endpoint and status
 */
export const requestsTotal = new Counter({
  name: 'aegis_requests_total',
  help: 'Total number of requests processed',
  labelNames: ['endpoint', 'method', 'status'] as const,
  registers: [register],
});

/**
 * Request duration histogram
 */
export const requestDuration = new Histogram({
  name: 'aegis_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['endpoint', 'method'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ============================================
// Security Metrics
// ============================================

/**
 * Threat detections counter by type and risk level
 */
export const threatsDetected = new Counter({
  name: 'aegis_threats_detected_total',
  help: 'Total number of threats detected',
  labelNames: ['threat_type', 'risk_level', 'action'] as const,
  registers: [register],
});

/**
 * Blocked requests counter
 */
export const blockedRequests = new Counter({
  name: 'aegis_blocked_requests_total',
  help: 'Total number of requests blocked',
  labelNames: ['reason', 'policy_id'] as const,
  registers: [register],
});

/**
 * PII detections counter
 */
export const piiDetections = new Counter({
  name: 'aegis_pii_detections_total',
  help: 'Total number of PII detections',
  labelNames: ['pii_type'] as const,
  registers: [register],
});

/**
 * Sensitive data detections counter
 */
export const sensitiveDetections = new Counter({
  name: 'aegis_sensitive_detections_total',
  help: 'Total number of sensitive data detections',
  labelNames: ['sensitive_type', 'category'] as const,
  registers: [register],
});

/**
 * Current risk score gauge (latest inspection)
 */
export const currentRiskScore = new Gauge({
  name: 'aegis_current_risk_score',
  help: 'Current risk score from latest inspection',
  labelNames: ['session_id'] as const,
  registers: [register],
});

// ============================================
// Inspection Metrics
// ============================================

/**
 * Inspection duration histogram
 */
export const inspectionDuration = new Histogram({
  name: 'aegis_inspection_duration_seconds',
  help: 'Inspection duration in seconds',
  labelNames: ['inspector_type'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

/**
 * Inspections total counter
 */
export const inspectionsTotal = new Counter({
  name: 'aegis_inspections_total',
  help: 'Total number of inspections performed',
  labelNames: ['inspector_type', 'result'] as const,
  registers: [register],
});

// ============================================
// ML Model Metrics
// ============================================

/**
 * ML model inference duration
 */
export const mlInferenceDuration = new Histogram({
  name: 'aegis_ml_inference_duration_seconds',
  help: 'ML model inference duration in seconds',
  labelNames: ['model_name'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register],
});

/**
 * ML model predictions counter
 */
export const mlPredictions = new Counter({
  name: 'aegis_ml_predictions_total',
  help: 'Total number of ML predictions',
  labelNames: ['model_name', 'label'] as const,
  registers: [register],
});

/**
 * ML model availability gauge
 */
export const mlModelAvailable = new Gauge({
  name: 'aegis_ml_model_available',
  help: 'ML model availability (1 = available, 0 = unavailable)',
  labelNames: ['model_name'] as const,
  registers: [register],
});

// ============================================
// Policy Metrics
// ============================================

/**
 * Policy evaluations counter
 */
export const policyEvaluations = new Counter({
  name: 'aegis_policy_evaluations_total',
  help: 'Total number of policy evaluations',
  labelNames: ['policy_id', 'action'] as const,
  registers: [register],
});

/**
 * Active policies gauge
 */
export const activePolicies = new Gauge({
  name: 'aegis_active_policies',
  help: 'Number of active policies',
  registers: [register],
});

// ============================================
// Rate Limiting Metrics
// ============================================

/**
 * Rate limit hits counter
 */
export const rateLimitHits = new Counter({
  name: 'aegis_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['client_id', 'limit_type'] as const,
  registers: [register],
});

// ============================================
// RAG/Agent Metrics
// ============================================

/**
 * RAG document scans counter
 */
export const ragScans = new Counter({
  name: 'aegis_rag_scans_total',
  help: 'Total number of RAG document scans',
  labelNames: ['result'] as const,
  registers: [register],
});

/**
 * Agent tool calls counter
 */
export const agentToolCalls = new Counter({
  name: 'aegis_agent_tool_calls_total',
  help: 'Total number of agent tool calls',
  labelNames: ['tool_name', 'result'] as const,
  registers: [register],
});

// ============================================
// System Metrics
// ============================================

/**
 * Active sessions gauge
 */
export const activeSessions = new Gauge({
  name: 'aegis_active_sessions',
  help: 'Number of active sessions being tracked',
  registers: [register],
});

/**
 * Audit log entries counter
 */
export const auditLogEntries = new Counter({
  name: 'aegis_audit_log_entries_total',
  help: 'Total number of audit log entries',
  labelNames: ['event_type', 'severity'] as const,
  registers: [register],
});

// ============================================
// Export Functions
// ============================================

/**
 * Get metrics in Prometheus format
 */
export const getMetrics = async (): Promise<string> => {
  return register.metrics();
};

/**
 * Get metrics content type
 */
export const getMetricsContentType = (): string => {
  return register.contentType;
};

/**
 * Get the registry instance
 */
export const getRegistry = (): Registry => {
  return register;
};

/**
 * Reset all metrics (useful for testing)
 */
export const resetMetrics = (): void => {
  register.resetMetrics();
};

// ============================================
// Helper Functions
// ============================================

/**
 * Record a request with timing
 */
export const recordRequest = (
  endpoint: string,
  method: string,
  status: number,
  durationMs: number,
): void => {
  requestsTotal.inc({ endpoint, method, status: String(status) });
  requestDuration.observe({ endpoint, method }, durationMs / 1000);
};

/**
 * Record a threat detection
 */
export const recordThreat = (
  threatType: string,
  riskLevel: string,
  action: string,
): void => {
  threatsDetected.inc({ threat_type: threatType, risk_level: riskLevel, action });
};

/**
 * Record an inspection result
 */
export const recordInspection = (
  inspectorType: string,
  passed: boolean,
  durationMs: number,
): void => {
  inspectionsTotal.inc({ inspector_type: inspectorType, result: passed ? 'pass' : 'fail' });
  inspectionDuration.observe({ inspector_type: inspectorType }, durationMs / 1000);
};

/**
 * Record PII detection
 */
export const recordPII = (piiType: string): void => {
  piiDetections.inc({ pii_type: piiType });
};

/**
 * Record sensitive data detection
 */
export const recordSensitive = (sensitiveType: string, category: string): void => {
  sensitiveDetections.inc({ sensitive_type: sensitiveType, category });
};

/**
 * Record ML inference
 */
export const recordMLInference = (
  modelName: string,
  label: string,
  durationMs: number,
): void => {
  mlPredictions.inc({ model_name: modelName, label });
  mlInferenceDuration.observe({ model_name: modelName }, durationMs / 1000);
};

/**
 * Set ML model availability
 */
export const setMLModelAvailable = (modelName: string, available: boolean): void => {
  mlModelAvailable.set({ model_name: modelName }, available ? 1 : 0);
};

/**
 * Record policy evaluation
 */
export const recordPolicyEvaluation = (policyId: string, action: string): void => {
  policyEvaluations.inc({ policy_id: policyId, action });
};

/**
 * Record blocked request
 */
export const recordBlocked = (reason: string, policyId: string): void => {
  blockedRequests.inc({ reason, policy_id: policyId });
};
