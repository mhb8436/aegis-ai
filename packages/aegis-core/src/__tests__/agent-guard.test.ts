import { describe, it, expect } from 'vitest';
import { validateToolCall } from '../guards/agent-guard.js';
import type { AgentPermissionConfig, ToolCall } from '@aegis/common';

const baseContext = { agentId: 'test-agent-001' };

const defaultPermissions: AgentPermissionConfig = {
  version: '1.0',
  tools: [
    {
      name: 'database_query',
      allowed: true,
      restrictions: [
        { tables: ['public_*'], operations: ['select'] },
        { tables: ['user_*'], operations: [] },
      ],
      rateLimit: '10/minute',
    },
    {
      name: 'file_read',
      allowed: true,
      restrictions: [
        { paths: ['/data/public/*'], allowed: true },
        { paths: ['/data/private/*'], allowed: false },
      ],
    },
    {
      name: 'file_write',
      allowed: false,
    },
    {
      name: 'api_call',
      allowed: true,
      whitelist: ['https://api.example.com/*'],
      blacklist: ['*.internal.corp/*'],
    },
    {
      name: 'shell_execute',
      allowed: false,
    },
  ],
};

const makeTool = (toolName: string, parameters: Record<string, unknown> = {}): ToolCall => ({
  toolName,
  parameters,
  context: baseContext,
});

describe('Agent Guard', () => {
  // --- Layer 1: Tool Whitelist ---

  describe('Tool Whitelist Check', () => {
    it('allows a whitelisted and enabled tool', () => {
      const decision = validateToolCall(
        makeTool('database_query', { table: 'public_data', operation: 'select' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(true);
    });

    it('denies a non-whitelisted tool', () => {
      const decision = validateToolCall(
        makeTool('unknown_tool'),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('tool_not_whitelisted');
    });

    it('denies an explicitly disallowed tool', () => {
      const decision = validateToolCall(
        makeTool('shell_execute', { command: 'ls' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('tool_not_whitelisted');
    });

    it('denies file_write which is set to allowed:false', () => {
      const decision = validateToolCall(
        makeTool('file_write', { path: '/data/public/test.txt', content: 'hello' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('tool_not_whitelisted');
    });
  });

  // --- Layer 2: Parameter Validation ---

  describe('Parameter Validation', () => {
    it('allows database query on public table', () => {
      const decision = validateToolCall(
        makeTool('database_query', { table: 'public_users', operation: 'select' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(true);
    });

    it('denies database query on restricted user table', () => {
      const decision = validateToolCall(
        makeTool('database_query', { table: 'user_secrets', operation: 'select' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('user_secrets');
    });

    it('allows file read on public path', () => {
      const decision = validateToolCall(
        makeTool('file_read', { path: '/data/public/doc.txt' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(true);
    });

    it('denies file read on private path', () => {
      const decision = validateToolCall(
        makeTool('file_read', { path: '/data/private/secret.txt' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('parameter_validation_failed');
    });

    it('allows API call to whitelisted URL', () => {
      const decision = validateToolCall(
        makeTool('api_call', { url: 'https://api.example.com/data' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(true);
    });

    it('denies API call to non-whitelisted URL', () => {
      const decision = validateToolCall(
        makeTool('api_call', { url: 'https://evil.com/steal' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('parameter_validation_failed');
      expect(decision.reason).toContain('not in whitelist');
    });
  });

  // --- Layer 3: Permission Scope ---

  describe('Permission Scope Check', () => {
    it('denies write operation on read-only table', () => {
      const decision = validateToolCall(
        makeTool('database_query', { table: 'public_data', operation: 'insert' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('permission_denied');
      expect(decision.reason).toContain('insert');
    });

    it('denies any operation on table with empty operations list', () => {
      const decision = validateToolCall(
        makeTool('database_query', { table: 'user_data', operation: 'select' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // --- Layer 4: Risk Assessment ---

  describe('Risk Assessment', () => {
    it('detects SQL injection in query parameters', () => {
      const decision = validateToolCall(
        makeTool('database_query', {
          table: 'public_data',
          operation: 'select',
          query: "SELECT * FROM public_data; DROP TABLE users; --",
        }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('high_risk');
      expect(decision.riskLevel).toBe('critical');
    });

    it('detects path traversal in file parameters', () => {
      const decision = validateToolCall(
        makeTool('file_read', { path: '/data/public/../../etc/passwd' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('high_risk');
      expect(decision.riskLevel).toBe('critical');
    });

    it('detects command substitution in parameters', () => {
      const decision = validateToolCall(
        makeTool('api_call', { url: 'https://api.example.com/$(id)' }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe('critical');
    });

    it('allows clean parameters with low risk', () => {
      const decision = validateToolCall(
        makeTool('database_query', {
          table: 'public_data',
          operation: 'select',
          query: 'SELECT name, email FROM public_data WHERE id = 1',
        }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('low');
    });
  });

  // --- Integration ---

  describe('Full Pipeline', () => {
    it('returns latencyMs in all decisions', () => {
      const allowed = validateToolCall(
        makeTool('database_query', { table: 'public_data', operation: 'select' }),
        defaultPermissions,
      );
      expect(allowed.latencyMs).toBeGreaterThanOrEqual(0);

      const denied = validateToolCall(
        makeTool('unknown_tool'),
        defaultPermissions,
      );
      expect(denied.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty permission config (default-deny)', () => {
      const decision = validateToolCall(
        makeTool('anything', {}),
        { version: '1.0', tools: [] },
      );
      expect(decision.allowed).toBe(false);
      expect(decision.denialType).toBe('tool_not_whitelisted');
    });

    it('passes clean tool call through all 4 layers', () => {
      const decision = validateToolCall(
        makeTool('database_query', {
          table: 'public_reports',
          operation: 'select',
          query: 'SELECT * FROM public_reports WHERE date > NOW()',
        }),
        defaultPermissions,
      );
      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('low');
      expect(decision.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
