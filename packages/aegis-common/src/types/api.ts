import type { DetectionResult, InspectionResult, OutputAnalysis } from './detection.js';

export interface ValidateRequest {
  readonly message: string;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ValidateResponse {
  readonly passed: boolean;
  readonly riskScore: number;
  readonly findings: DetectionResult[];
  readonly requestId: string;
}

export interface ChatProxyRequest {
  readonly message: string;
  readonly sessionId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ContextOptions {
  readonly maxHistoryTurns?: number;
  readonly trackIntentTrajectory?: boolean;
  readonly driftThreshold?: number;
}

export interface InspectRequest {
  readonly message: string;
  readonly sessionId?: string;
  readonly conversationHistory?: string[];
  readonly metadata?: Record<string, unknown>;
  readonly enableSemantic?: boolean;
  readonly enableContext?: boolean;
  readonly contextOptions?: ContextOptions;
}

export interface InspectResponse {
  readonly requestId: string;
  readonly result: InspectionResult;
}

export interface OutputAnalyzeRequest {
  readonly output: string;
  readonly context?: Record<string, unknown>;
}

export interface OutputAnalyzeResponse {
  readonly requestId: string;
  readonly analysis: OutputAnalysis;
}

export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly version: string;
  readonly uptime: number;
  readonly timestamp: string;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}
