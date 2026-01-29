import pino from 'pino';
import type { AuditLogEntry, ThreatEvent, DashboardStats, RiskLevel } from '@aegis/common';
import type { AuditRepo } from '../db/audit-repo.js';

const auditLog = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

const auditEntries: AuditLogEntry[] = [];
const threatEvents: ThreatEvent[] = [];
const MAX_ENTRIES = 10000;

let repo: AuditRepo | null = null;

export const setAuditRepo = (r: AuditRepo): void => {
  repo = r;
};

export const logRequest = (entry: AuditLogEntry): void => {
  auditEntries.push(entry);
  if (auditEntries.length > MAX_ENTRIES) {
    auditEntries.splice(0, auditEntries.length - MAX_ENTRIES);
  }
  auditLog.info({ type: 'audit_request', ...entry });

  if (repo) {
    repo.insertRequest(entry);
  }
};

export const logThreatEvent = (event: ThreatEvent): void => {
  threatEvents.push(event);
  if (threatEvents.length > MAX_ENTRIES) {
    threatEvents.splice(0, threatEvents.length - MAX_ENTRIES);
  }
  auditLog.warn({ type: 'threat_event', ...event });

  if (repo) {
    repo.insertThreatEvent(event);
  }
};

export const getRecentEvents = (limit: number = 20): ThreatEvent[] =>
  threatEvents.slice(-limit).reverse();

export const getRecentLogs = (
  limit: number = 50,
  filters?: { threatType?: string; startTime?: string; endTime?: string },
): AuditLogEntry[] => {
  let filtered = auditEntries;

  if (filters?.startTime) {
    filtered = filtered.filter((e) => e.timestamp >= filters.startTime!);
  }
  if (filters?.endTime) {
    filtered = filtered.filter((e) => e.timestamp <= filters.endTime!);
  }

  return filtered.slice(-limit).reverse();
};

export const getStats = (): DashboardStats => {
  const total = auditEntries.length;
  const blocked = auditEntries.filter((e) => e.finalAction === 'block').length;
  const warned = auditEntries.filter((e) => e.finalAction === 'warn').length;

  const threatsByType: Partial<Record<string, number>> = {};
  for (const event of threatEvents) {
    threatsByType[event.threatType] = (threatsByType[event.threatType] ?? 0) + 1;
  }

  let riskLevel: RiskLevel = 'low';
  if (total > 0) {
    const blockRate = blocked / total;
    if (blockRate > 0.1) riskLevel = 'critical';
    else if (blockRate > 0.05) riskLevel = 'high';
    else if (blockRate > 0.01) riskLevel = 'medium';
  }

  return {
    totalRequests: total,
    blockedRequests: blocked,
    warnedRequests: warned,
    riskLevel,
    threatsByType,
    recentEvents: getRecentEvents(10),
  };
};
