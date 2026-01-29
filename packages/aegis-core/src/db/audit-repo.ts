import pino from 'pino';
import type { ClickHouseClient } from '@clickhouse/client';
import type { AuditLogEntry, ThreatEvent } from '@aegis/common';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface AuditRepo {
  insertRequest(entry: AuditLogEntry): void;
  insertThreatEvent(event: ThreatEvent): void;
  queryRequests(limit: number): Promise<AuditLogEntry[]>;
  queryThreatEvents(limit: number): Promise<ThreatEvent[]>;
}

export const createAuditRepo = (client: ClickHouseClient): AuditRepo => ({
  insertRequest(entry: AuditLogEntry): void {
    client
      .insert({
        table: 'audit_requests',
        values: [
          {
            id: entry.id,
            timestamp: entry.timestamp,
            request_id: entry.requestId,
            session_id: entry.sessionId ?? '',
            source_ip: entry.sourceIp ?? '',
            message: entry.message,
            edge_passed: entry.edgePassed ? 1 : 0,
            edge_risk_score: entry.edgeRiskScore,
            core_passed: entry.corePassed ? 1 : 0,
            core_risk_score: entry.coreRiskScore ?? 0,
            final_action: entry.finalAction,
            block_reason: entry.blockReason ?? '',
          },
        ],
        format: 'JSONEachRow',
      })
      .catch((err) => logger.error({ err }, 'Failed to insert audit request'));
  },

  insertThreatEvent(event: ThreatEvent): void {
    client
      .insert({
        table: 'threat_events',
        values: [
          {
            id: event.id,
            timestamp: event.timestamp,
            request_id: event.requestId,
            threat_type: event.threatType,
            severity: event.severity,
            details: event.details,
            matched_rules: event.matchedRules,
          },
        ],
        format: 'JSONEachRow',
      })
      .catch((err) => logger.error({ err }, 'Failed to insert threat event'));
  },

  async queryRequests(limit: number): Promise<AuditLogEntry[]> {
    const result = await client.query({
      query: `SELECT * FROM audit_requests ORDER BY timestamp DESC LIMIT {limit:UInt32}`,
      query_params: { limit },
      format: 'JSONEachRow',
    });
    const rows = await result.json<Record<string, unknown>>();
    return rows.map((r) => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      requestId: r.request_id as string,
      sessionId: (r.session_id as string) || undefined,
      sourceIp: (r.source_ip as string) || undefined,
      message: r.message as string,
      edgePassed: r.edge_passed === 1,
      edgeRiskScore: r.edge_risk_score as number,
      edgeMatchedPatterns: [],
      edgeLatencyMs: 0,
      corePassed: r.core_passed === 1,
      coreRiskScore: r.core_risk_score as number,
      coreFindings: [],
      coreLatencyMs: 0,
      finalAction: r.final_action as 'allow' | 'block' | 'warn',
      blockReason: (r.block_reason as string) || undefined,
    }));
  },

  async queryThreatEvents(limit: number): Promise<ThreatEvent[]> {
    const result = await client.query({
      query: `SELECT * FROM threat_events ORDER BY timestamp DESC LIMIT {limit:UInt32}`,
      query_params: { limit },
      format: 'JSONEachRow',
    });
    const rows = await result.json<Record<string, unknown>>();
    return rows.map((r) => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      requestId: r.request_id as string,
      threatType: r.threat_type as ThreatEvent['threatType'],
      severity: r.severity as ThreatEvent['severity'],
      details: r.details as string,
      matchedRules: r.matched_rules as string[],
    }));
  },
});
