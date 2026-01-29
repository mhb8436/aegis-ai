import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
});

export interface DashboardStats {
  totalRequests: number;
  blockedRequests: number;
  warnedRequests: number;
  riskLevel: string;
  threatsByType: Record<string, number>;
  recentEvents: ThreatEvent[];
}

export interface ThreatEvent {
  id: string;
  timestamp: string;
  requestId: string;
  threatType: string;
  severity: string;
  details: string;
  matchedRules: string[];
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  requestId: string;
  sessionId?: string;
  sourceIp?: string;
  message: string;
  finalAction: string;
  coreRiskScore?: number;
  coreFindings?: string[];
  coreLatencyMs?: number;
  blockReason?: string;
}

interface PatternConfig {
  type: 'regex';
  value: string;
  flags?: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  action: string;
  isActive: boolean;
  priority: number;
  patterns: PatternConfig[];
}

export interface PolicyConfig {
  version: string;
  rules: PolicyRule[];
}

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  timestamp: string;
}

// --- Dashboard ---

export const useStats = () =>
  useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data } = await api.post('/reports/generate', {
        reportType: 'daily',
      });
      return data;
    },
    refetchInterval: 30000,
  });

export const useRecentEvents = (limit: number = 20) =>
  useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', limit],
    queryFn: async () => {
      const { data } = await api.get(`/audit/logs?limit=${limit}`);
      return data;
    },
    refetchInterval: 10000,
  });

// --- Policies ---

export const usePolicies = () =>
  useQuery<PolicyConfig>({
    queryKey: ['policies'],
    queryFn: async () => {
      const { data } = await api.get('/policies');
      return data;
    },
  });

export const useCreatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Omit<PolicyRule, 'id'>) => {
      const { data } = await api.post('/policies', rule);
      return data as PolicyRule;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
};

export const useUpdatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PolicyRule> }) => {
      const { data } = await api.put(`/policies/${id}`, updates);
      return data as PolicyRule;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
};

export const useDeletePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/policies/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
};

export const useTogglePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data } = await api.put(`/policies/${id}`, { isActive });
      return data as PolicyRule;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
};

// --- Audit Logs (with params) ---

export interface AuditLogParams {
  limit?: number;
  threatType?: string;
  startTime?: string;
  endTime?: string;
}

export const useAuditLogs = (params: AuditLogParams = {}) => {
  const queryParams = new URLSearchParams();
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.threatType) queryParams.set('threat_type', params.threatType);
  if (params.startTime) queryParams.set('start_time', params.startTime);
  if (params.endTime) queryParams.set('end_time', params.endTime);

  return useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const { data } = await api.get(`/audit/logs?${queryParams.toString()}`);
      return data;
    },
    refetchInterval: 15000,
  });
};

// --- Reports ---

export const useGenerateReport = () =>
  useMutation({
    mutationFn: async (reportType: string) => {
      const { data } = await api.post('/reports/generate', { reportType });
      return data as DashboardStats;
    },
  });

// --- Health ---

export const useEdgeHealth = () =>
  useQuery<HealthResponse>({
    queryKey: ['edge-health'],
    queryFn: async () => {
      const { data } = await axios.get('/health', { baseURL: '', timeout: 5000 });
      return data;
    },
    refetchInterval: 30000,
    retry: false,
  });

export const useCoreHealth = () =>
  useQuery<HealthResponse>({
    queryKey: ['core-health'],
    queryFn: async () => {
      const { data } = await axios.get('/health', { baseURL: '/api', timeout: 5000 });
      return data;
    },
    refetchInterval: 30000,
    retry: false,
  });
