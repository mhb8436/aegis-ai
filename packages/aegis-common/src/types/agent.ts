import type { RiskLevel } from './detection.js';

export interface AgentContext {
  readonly agentId: string;
  readonly sessionId?: string;
  readonly userId?: string;
  readonly conversationId?: string;
}

export interface ToolCall {
  readonly toolName: string;
  readonly parameters: Record<string, unknown>;
  readonly context: AgentContext;
}

export type ToolCallDenialReason =
  | 'tool_not_whitelisted'
  | 'parameter_validation_failed'
  | 'permission_denied'
  | 'high_risk';

export interface ToolCallDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly denialType?: ToolCallDenialReason;
  readonly riskLevel: RiskLevel;
  readonly modifiedParams?: Record<string, unknown>;
  readonly matchedRestrictions?: string[];
  readonly latencyMs: number;
}

export interface ToolRestriction {
  readonly tables?: string[];
  readonly operations?: string[];
  readonly paths?: string[];
  readonly allowed?: boolean;
}

export interface ToolPermission {
  readonly name: string;
  readonly allowed: boolean;
  readonly restrictions?: ToolRestriction[];
  readonly rateLimit?: string;
  readonly whitelist?: string[];
  readonly blacklist?: string[];
}

export interface AgentPermissionConfig {
  readonly version: string;
  readonly tools: ToolPermission[];
}

export interface ToolCallValidateRequest {
  readonly toolName: string;
  readonly parameters: Record<string, unknown>;
  readonly agentId: string;
  readonly sessionId?: string;
  readonly userId?: string;
  readonly conversationId?: string;
}

export interface ToolCallValidateResponse {
  readonly requestId: string;
  readonly decision: ToolCallDecision;
}
