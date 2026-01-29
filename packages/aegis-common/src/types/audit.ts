import type { RiskLevel, ThreatType, DetectionAction } from './detection.js';

export interface AuditLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly sessionId?: string;
  readonly sourceIp?: string;
  readonly message: string;
  readonly edgePassed: boolean;
  readonly edgeRiskScore: number;
  readonly edgeMatchedPatterns: string[];
  readonly edgeLatencyMs: number;
  readonly corePassed?: boolean;
  readonly coreRiskScore?: number;
  readonly coreFindings?: string[];
  readonly coreLatencyMs?: number;
  readonly finalAction: DetectionAction;
  readonly blockReason?: string;
}

export interface ThreatEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly threatType: ThreatType;
  readonly severity: RiskLevel;
  readonly details: string;
  readonly matchedRules: string[];
}

export interface DashboardStats {
  readonly totalRequests: number;
  readonly blockedRequests: number;
  readonly warnedRequests: number;
  readonly riskLevel: RiskLevel;
  readonly threatsByType: Partial<Record<ThreatType, number>>;
  readonly recentEvents: ThreatEvent[];
}
