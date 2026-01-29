import type { RiskLevel } from './detection.js';

// --- LLM Proxy ---

export interface LLMProviderConfig {
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKeyEnvVar: string;
  readonly defaultModel?: string;
  readonly headers?: Record<string, string>;
}

export interface LLMProxyRequest {
  readonly provider: string;
  readonly model?: string;
  readonly messages: Array<{ role: string; content: string }>;
  readonly stream?: boolean;
  readonly sessionId?: string;
  readonly options?: Record<string, unknown>;
}

export interface LLMProxyResponse {
  readonly requestId: string;
  readonly inputGuard: { passed: boolean; riskScore: number };
  readonly outputGuard?: { passed: boolean; riskScore: number; piiDetected?: string[] };
  readonly llmResponse?: unknown;
  readonly blocked: boolean;
  readonly blockReason?: string;
  readonly latencyMs: number;
}

// --- RAG Ingest ---

export interface RAGIngestDocument {
  readonly content: string;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RAGIngestRequest {
  readonly documents: RAGIngestDocument[];
}

export interface RAGIngestDocumentResult {
  readonly index: number;
  readonly isSafe: boolean;
  readonly riskScore: number;
  readonly findings: Array<{ type: string; description: string; severity: RiskLevel }>;
}

export interface RAGIngestResult {
  readonly requestId: string;
  readonly results: RAGIngestDocumentResult[];
  readonly totalScanned: number;
  readonly totalBlocked: number;
}

export interface RAGChunkValidateRequest {
  readonly chunks: Array<{
    content: string;
    source?: string;
    chunkId?: string;
  }>;
}

export interface RAGChunkResult {
  readonly chunkId?: string;
  readonly isSafe: boolean;
  readonly riskScore: number;
}

export interface RAGChunkValidateResult {
  readonly requestId: string;
  readonly results: RAGChunkResult[];
}

// --- MCP Gateway ---

export type MCPToolDescriptionThreat =
  | 'instruction_injection'
  | 'hidden_directive'
  | 'credential_exposure'
  | 'excessive_scope';

export interface MCPTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
}

export interface MCPValidateRequest {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly tools?: MCPTool[];
}

export interface MCPToolFinding {
  readonly toolName: string;
  readonly threatType: MCPToolDescriptionThreat;
  readonly description: string;
  readonly severity: RiskLevel;
  readonly matched?: string;
}

export interface MCPValidateResult {
  readonly requestId: string;
  readonly isSafe: boolean;
  readonly findings: MCPToolFinding[];
  readonly riskScore: number;
  readonly latencyMs: number;
}
