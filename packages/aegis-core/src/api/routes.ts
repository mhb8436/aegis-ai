import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { validateMessage } from '@aegis/common';
import type {
  InspectRequest,
  InspectResponse,
  OutputAnalyzeRequest,
  OutputAnalyzeResponse,
  PolicyRule,
  RAGScanRequest,
  RAGScanResponse,
  AgentPermissionConfig,
  ToolCallValidateRequest,
  ToolCallValidateResponse,
  LLMProviderConfig,
  LLMProxyRequest,
  RAGIngestRequest,
  RAGChunkValidateRequest,
  MCPValidateRequest,
  EmbeddingVector,
  TrustLevel,
  DocumentSource,
} from '@aegis/common';
import { deepInspect } from '../guards/deep-inspector.js';
import { analyzeOutput } from '../guards/output-guard.js';
import { scanDocument } from '../guards/rag-guard.js';
import { validateToolCall } from '../guards/agent-guard.js';
import { verifyEmbeddingIntegrity, verifyEmbeddingBatch } from '../guards/embedding-integrity.js';
import { detectSemanticDrift, compareChunkConsistency, generateContentSignature } from '../guards/semantic-drift.js';
import { createDocumentSource, createProvenance, addProvenanceEntry, validateProvenance, shouldAllowAccess } from '../guards/document-provenance.js';
import { proxyLLMChat } from '../integrations/llm-proxy.js';
import { scanIngestDocuments, validateChunks } from '../integrations/rag-scanner.js';
import { validateMCPRequest } from '../integrations/mcp-gateway.js';
import { evaluatePolicy, type PolicyStore } from '../policy/policy-engine.js';
import type { AdvancedPolicyStore } from '../policy/advanced-policy-engine.js';
import { logRequest, logThreatEvent, getRecentLogs, getStats } from '../audit/audit-logger.js';
import type { ModelRegistry } from '../ml/index.js';
import {
  getMetrics,
  getMetricsContentType,
  recordRequest,
  recordThreat,
  recordInspection,
  recordPII,
  recordSensitive,
  recordBlocked,
  recordPolicyEvaluation,
  ragScans,
  agentToolCalls,
} from '../monitoring/index.js';

export const createRouter = (
  store: PolicyStore,
  agentPermissions?: AgentPermissionConfig,
  llmProviders?: LLMProviderConfig[],
  dryRun?: boolean,
  mlRegistry?: ModelRegistry | null,
): Router => {
  const router = Router();

  // --- Prometheus Metrics ---

  router.get('/metrics', async (_req, res) => {
    try {
      const metrics = await getMetrics();
      res.set('Content-Type', getMetricsContentType());
      res.send(metrics);
    } catch (err) {
      res.status(500).json({ code: 'METRICS_ERROR', message: (err as Error).message });
    }
  });

  // --- Health Check ---

  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    });
  });

  router.post('/inspect', async (req, res) => {
    const startTime = Date.now();
    const requestId = (req.headers['x-aegis-request-id'] as string) ?? uuidv4();
    const body = req.body as InspectRequest;

    const messageResult = validateMessage(body.message);
    if (!messageResult.ok) {
      recordRequest('/inspect', 'POST', 400, Date.now() - startTime);
      res.status(400).json({ code: 'INVALID_INPUT', message: messageResult.error });
      return;
    }

    const policies = store.getConfig();
    const inspectionResult = await deepInspect(body, mlRegistry);
    const policyFindings = evaluatePolicy(body.message, policies);

    const allFindings = [...inspectionResult.findings, ...policyFindings];
    const maxRiskScore = allFindings.length > 0
      ? Math.max(inspectionResult.riskScore, ...policyFindings.map((f) => f.confidence))
      : 0;

    const passed = maxRiskScore < 0.7;
    const finalAction = passed ? 'allow' as const : 'block' as const;

    // Record metrics
    recordInspection('deep', passed, inspectionResult.latencyMs);
    for (const finding of allFindings) {
      if (finding.detected && finding.type) {
        recordThreat(finding.type, finding.riskLevel, finalAction);
      }
    }
    if (!passed) {
      recordBlocked('injection_detected', 'deep_inspect');
    }

    logRequest({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      requestId,
      sessionId: body.sessionId,
      sourceIp: req.ip ?? '',
      message: body.message.slice(0, 200),
      edgePassed: true,
      edgeRiskScore: parseFloat((req.headers['x-aegis-risk-score'] as string) ?? '0'),
      edgeMatchedPatterns: [],
      edgeLatencyMs: 0,
      corePassed: passed,
      coreRiskScore: maxRiskScore,
      coreFindings: allFindings.map((f) => f.type ?? 'unknown'),
      coreLatencyMs: inspectionResult.latencyMs,
      finalAction,
      blockReason: passed ? undefined : 'Injection detected by deep inspection',
    });

    for (const finding of allFindings) {
      if (finding.detected && finding.type) {
        logThreatEvent({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          requestId,
          threatType: finding.type,
          severity: finding.riskLevel,
          details: `Matched: ${finding.matchedPatterns.join(', ')}`,
          matchedRules: finding.matchedPatterns,
        });
      }
    }

    const response: InspectResponse = {
      requestId,
      result: {
        passed,
        findings: allFindings,
        riskScore: maxRiskScore,
        latencyMs: inspectionResult.latencyMs,
      },
    };

    recordRequest('/inspect', 'POST', passed ? 200 : 403, Date.now() - startTime);
    res.status(passed ? 200 : 403).json(response);
  });

  router.post('/output/analyze', async (req, res) => {
    const startTime = Date.now();
    const requestId = uuidv4();
    const body = req.body as OutputAnalyzeRequest;

    if (!body.output || typeof body.output !== 'string') {
      recordRequest('/output/analyze', 'POST', 400, Date.now() - startTime);
      res.status(400).json({ code: 'INVALID_INPUT', message: 'output must be a string' });
      return;
    }

    const analysis = await analyzeOutput(body.output, body.context, mlRegistry);

    // Record PII metrics
    for (const pii of analysis.piiFindings) {
      recordPII(pii.type);
    }

    // Record sensitive data metrics
    for (const sensitive of analysis.sensitiveFindings) {
      recordSensitive(sensitive.type, sensitive.category);
    }

    const response: OutputAnalyzeResponse = {
      requestId,
      analysis,
    };

    recordRequest('/output/analyze', 'POST', 200, Date.now() - startTime);
    res.json(response);
  });

  // --- Policy CRUD ---

  router.get('/policies', (_req, res) => {
    res.json(store.getConfig());
  });

  router.post('/policies', (req, res) => {
    const body = req.body as Omit<PolicyRule, 'id'> & { id?: string };
    const rule: PolicyRule = {
      id: body.id ?? uuidv4(),
      name: body.name,
      description: body.description ?? '',
      category: body.category,
      severity: body.severity ?? 'medium',
      action: body.action ?? 'block',
      isActive: body.isActive ?? true,
      priority: body.priority ?? 100,
      patterns: body.patterns ?? [],
    };
    store.addRule(rule);
    res.status(201).json(rule);
  });

  router.put('/policies/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body as Partial<Omit<PolicyRule, 'id'>>;
    const updated = store.updateRule(id, updates);
    if (!updated) {
      res.status(404).json({ code: 'NOT_FOUND', message: `Rule ${id} not found` });
      return;
    }
    res.json(updated);
  });

  router.delete('/policies/:id', (req, res) => {
    const { id } = req.params;
    const deleted = store.deleteRule(id);
    if (!deleted) {
      res.status(404).json({ code: 'NOT_FOUND', message: `Rule ${id} not found` });
      return;
    }
    res.status(204).send();
  });

  // --- RAG Guard ---

  router.post('/rag/scan', (req, res) => {
    const requestId = uuidv4();
    const body = req.body as RAGScanRequest;

    if (!body.content || typeof body.content !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'content must be a non-empty string' });
      return;
    }

    const result = scanDocument({ content: body.content, source: body.source, metadata: body.metadata });

    // Record RAG scan metrics
    ragScans.inc({ result: result.isSafe ? 'safe' : 'unsafe' });

    if (!result.isSafe) {
      for (const finding of result.findings) {
        logThreatEvent({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          requestId,
          threatType: finding.type,
          severity: finding.severity,
          details: finding.description,
          matchedRules: finding.matched ? [finding.matched] : [],
        });
        recordThreat(finding.type, finding.severity, 'block');
      }
    }

    const response: RAGScanResponse = { requestId, result };
    res.status(result.isSafe ? 200 : 403).json(response);
  });

  // --- Agent Guard ---

  router.post('/agent/validate-tool', (req, res) => {
    const requestId = uuidv4();
    const body = req.body as ToolCallValidateRequest;

    if (!body.toolName || typeof body.toolName !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'toolName must be a non-empty string' });
      return;
    }
    if (!body.agentId || typeof body.agentId !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'agentId must be a non-empty string' });
      return;
    }

    const permissions = agentPermissions ?? { version: '1.0', tools: [] };

    const toolCall = {
      toolName: body.toolName,
      parameters: body.parameters ?? {},
      context: {
        agentId: body.agentId,
        sessionId: body.sessionId,
        userId: body.userId,
        conversationId: body.conversationId,
      },
    };

    const decision = validateToolCall(toolCall, permissions);

    // Record agent tool call metrics
    agentToolCalls.inc({
      tool_name: body.toolName,
      result: decision.allowed ? 'allowed' : 'denied',
    });

    if (!decision.allowed) {
      logThreatEvent({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        requestId,
        threatType: 'tool_abuse',
        severity: decision.riskLevel,
        details: decision.reason ?? 'Tool call denied',
        matchedRules: decision.matchedRestrictions ?? [],
      });
      recordThreat('tool_abuse', decision.riskLevel, 'block');
    }

    const response: ToolCallValidateResponse = { requestId, decision };
    res.status(decision.allowed ? 200 : 403).json(response);
  });

  // --- LLM Proxy ---

  router.post('/llm/chat', (req, res) => {
    const body = req.body as LLMProxyRequest;

    if (!body.provider || typeof body.provider !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'provider must be a non-empty string' });
      return;
    }
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'messages must be a non-empty array' });
      return;
    }

    const providers = llmProviders ?? [];
    const isDryRun = dryRun ?? true;

    proxyLLMChat(body, providers, isDryRun, mlRegistry)
      .then((result) => {
        if (result.blocked) {
          logThreatEvent({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            requestId: result.requestId,
            threatType: 'prompt_injection',
            severity: 'high',
            details: result.blockReason ?? 'LLM request blocked',
            matchedRules: [],
          });
        }
        res.status(result.blocked ? 403 : 200).json(result);
      })
      .catch((err: Error) => {
        res.status(500).json({ code: 'LLM_PROXY_ERROR', message: err.message });
      });
  });

  // --- RAG Ingest ---

  router.post('/rag/ingest', (req, res) => {
    const body = req.body as RAGIngestRequest;

    if (!body.documents || !Array.isArray(body.documents) || body.documents.length === 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'documents must be a non-empty array' });
      return;
    }

    const result = scanIngestDocuments(body);

    if (result.totalBlocked > 0) {
      for (const docResult of result.results) {
        if (!docResult.isSafe) {
          for (const finding of docResult.findings) {
            logThreatEvent({
              id: uuidv4(),
              timestamp: new Date().toISOString(),
              requestId: result.requestId,
              threatType: finding.type as import('@aegis/common').ThreatType,
              severity: finding.severity,
              details: finding.description,
              matchedRules: [],
            });
          }
        }
      }
    }

    res.status(result.totalBlocked > 0 ? 403 : 200).json(result);
  });

  router.post('/rag/validate-chunks', (req, res) => {
    const body = req.body as RAGChunkValidateRequest;

    if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length === 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'chunks must be a non-empty array' });
      return;
    }

    const result = validateChunks(body);
    const hasUnsafe = result.results.some((r) => !r.isSafe);
    res.status(hasUnsafe ? 403 : 200).json(result);
  });

  // --- RAG Guard: Embedding Integrity ---

  router.post('/rag/verify-embedding', (req, res) => {
    const body = req.body as { embedding: EmbeddingVector; expectedDimension?: number };

    if (!body.embedding || !Array.isArray(body.embedding.values)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'embedding.values must be an array' });
      return;
    }

    const result = verifyEmbeddingIntegrity(body.embedding, body.expectedDimension);
    res.json({
      requestId: uuidv4(),
      result,
    });
  });

  router.post('/rag/verify-embeddings', (req, res) => {
    const body = req.body as { embeddings: EmbeddingVector[]; expectedDimension?: number };

    if (!body.embeddings || !Array.isArray(body.embeddings)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'embeddings must be an array' });
      return;
    }

    const result = verifyEmbeddingBatch(body.embeddings, body.expectedDimension);
    res.json({
      requestId: uuidv4(),
      totalChecked: body.embeddings.length,
      validCount: result.valid.length,
      invalidCount: result.invalid.length,
      valid: result.valid.map((e) => e.id),
      invalid: result.invalid.map((i) => ({
        id: i.embedding.id,
        issues: i.result.issues,
      })),
    });
  });

  // --- RAG Guard: Semantic Drift Detection ---

  router.post('/rag/detect-drift', (req, res) => {
    const body = req.body as { originalContent: string; currentContent: string };

    if (!body.originalContent || !body.currentContent) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'originalContent and currentContent are required' });
      return;
    }

    const result = detectSemanticDrift(body.originalContent, body.currentContent);
    res.json({
      requestId: uuidv4(),
      result,
    });
  });

  router.post('/rag/check-chunk-consistency', (req, res) => {
    const body = req.body as { chunks: Array<{ id: string; content: string }> };

    if (!body.chunks || !Array.isArray(body.chunks) || body.chunks.length < 2) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'chunks must be an array with at least 2 items' });
      return;
    }

    const results = compareChunkConsistency(body.chunks);
    res.json({
      requestId: uuidv4(),
      totalChecked: body.chunks.length,
      driftDetected: results.length,
      results,
    });
  });

  router.post('/rag/content-signature', (req, res) => {
    const body = req.body as { content: string };

    if (!body.content || typeof body.content !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'content must be a non-empty string' });
      return;
    }

    const signature = generateContentSignature(body.content);
    res.json({
      requestId: uuidv4(),
      signature,
    });
  });

  // --- RAG Guard: Document Provenance ---

  router.post('/rag/provenance/create', (req, res) => {
    const body = req.body as {
      documentId: string;
      sourceType: DocumentSource['type'];
      origin: string;
      content?: string;
      verified?: boolean;
    };

    if (!body.documentId || !body.sourceType || !body.origin) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'documentId, sourceType, and origin are required' });
      return;
    }

    const source = createDocumentSource(body.sourceType, body.origin, body.verified);
    const provenance = createProvenance(body.documentId, source, body.content);

    res.status(201).json({
      requestId: uuidv4(),
      provenance,
    });
  });

  router.post('/rag/provenance/add-entry', (req, res) => {
    const body = req.body as {
      provenance: import('@aegis/common').DocumentProvenance;
      action: import('@aegis/common').ProvenanceEntry['action'];
      actor: string;
      content?: string;
      details?: string;
    };

    if (!body.provenance || !body.action || !body.actor) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'provenance, action, and actor are required' });
      return;
    }

    const updated = addProvenanceEntry(body.provenance, body.action, body.actor, body.content, body.details);
    res.json({
      requestId: uuidv4(),
      provenance: updated,
    });
  });

  router.post('/rag/provenance/validate', (req, res) => {
    const body = req.body as {
      provenance: import('@aegis/common').DocumentProvenance;
      currentContent?: string;
    };

    if (!body.provenance) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'provenance is required' });
      return;
    }

    const result = validateProvenance(body.provenance, body.currentContent);
    res.json({
      requestId: uuidv4(),
      result,
    });
  });

  router.post('/rag/provenance/check-access', (req, res) => {
    const body = req.body as {
      provenance: import('@aegis/common').DocumentProvenance;
      requiredTrustLevel: TrustLevel;
    };

    if (!body.provenance || !body.requiredTrustLevel) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'provenance and requiredTrustLevel are required' });
      return;
    }

    const result = shouldAllowAccess(body.provenance, body.requiredTrustLevel);
    res.json({
      requestId: uuidv4(),
      ...result,
    });
  });

  // --- MCP Gateway ---

  router.post('/mcp/validate', (req, res) => {
    const body = req.body as MCPValidateRequest;

    if (!body.method || typeof body.method !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'method must be a non-empty string' });
      return;
    }
    if (!body.params || typeof body.params !== 'object') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'params must be an object' });
      return;
    }

    const result = validateMCPRequest(body);

    if (!result.isSafe) {
      for (const finding of result.findings) {
        logThreatEvent({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          requestId: result.requestId,
          threatType: finding.threatType as import('@aegis/common').ThreatType,
          severity: finding.severity,
          details: finding.description,
          matchedRules: finding.matched ? [finding.matched] : [],
        });
      }
    }

    res.status(result.isSafe ? 200 : 403).json(result);
  });

  // --- Audit & Reports ---

  router.get('/audit/logs', (req, res) => {
    const limit = parseInt((req.query.limit as string) ?? '50', 10);
    const filters = {
      threatType: req.query.threat_type as string | undefined,
      startTime: req.query.start_time as string | undefined,
      endTime: req.query.end_time as string | undefined,
    };
    const logs = getRecentLogs(limit, filters);
    res.json({ logs, total: logs.length });
  });

  router.post('/reports/generate', (_req, res) => {
    const stats = getStats();
    res.json(stats);
  });

  // --- Policy Version Management ---
  // These endpoints require AdvancedPolicyStore

  router.get('/policies/versions', (_req, res) => {
    const advStore = store as unknown as AdvancedPolicyStore;
    if (typeof advStore.getVersions !== 'function') {
      res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Version management not available' });
      return;
    }
    const versions = advStore.getVersions();
    res.json({ versions, total: versions.length });
  });

  router.post('/policies/versions', (req, res) => {
    const advStore = store as unknown as AdvancedPolicyStore;
    if (typeof advStore.createVersion !== 'function') {
      res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Version management not available' });
      return;
    }
    const { description, createdBy } = req.body as { description?: string; createdBy?: string };
    const version = advStore.createVersion(description, createdBy);
    res.status(201).json(version);
  });

  router.get('/policies/versions/:versionId', (req, res) => {
    const advStore = store as unknown as AdvancedPolicyStore;
    if (typeof advStore.getVersion !== 'function') {
      res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Version management not available' });
      return;
    }
    const version = advStore.getVersion(req.params.versionId);
    if (!version) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Version not found' });
      return;
    }
    res.json(version);
  });

  router.post('/policies/rollback/:versionId', (req, res) => {
    const advStore = store as unknown as AdvancedPolicyStore;
    if (typeof advStore.rollback !== 'function') {
      res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Version management not available' });
      return;
    }
    const success = advStore.rollback(req.params.versionId);
    if (!success) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Version not found' });
      return;
    }
    res.json({ message: 'Rollback successful', versionId: req.params.versionId });
  });

  router.post('/policies/reload', async (_req, res) => {
    const advStore = store as unknown as AdvancedPolicyStore;
    if (typeof advStore.reload !== 'function') {
      res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Dynamic reload not available' });
      return;
    }
    try {
      await advStore.reload();
      res.json({ message: 'Policies reloaded successfully' });
    } catch (err) {
      res.status(500).json({ code: 'RELOAD_FAILED', message: (err as Error).message });
    }
  });

  return router;
};
