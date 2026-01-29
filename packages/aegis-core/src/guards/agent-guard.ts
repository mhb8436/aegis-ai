import type {
  ToolCall,
  ToolCallDecision,
  ToolPermission,
  AgentPermissionConfig,
  ToolRestriction,
  RiskLevel,
} from '@aegis/common';

// --- Dangerous parameter patterns ---

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string; risk: RiskLevel }> = [
  // SQL injection
  { pattern: /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s/i, description: 'SQL injection (destructive statement)', risk: 'critical' },
  { pattern: /UNION\s+SELECT/i, description: 'SQL UNION injection', risk: 'critical' },
  { pattern: /['"];\s*--/, description: 'SQL comment injection', risk: 'high' },
  { pattern: /OR\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i, description: 'SQL tautology injection', risk: 'high' },
  // Path traversal
  { pattern: /\.\.[\\/]/, description: 'Path traversal attempt', risk: 'critical' },
  { pattern: /\/etc\/(passwd|shadow|hosts)/i, description: 'Sensitive system file access', risk: 'critical' },
  { pattern: /\/proc\/self/i, description: 'Process info access attempt', risk: 'critical' },
  // Command injection
  { pattern: /[`$]\(/, description: 'Command substitution attempt', risk: 'critical' },
  { pattern: /;\s*(rm|cat|curl|wget|nc|bash|sh|python|node)\s/i, description: 'Command chaining attempt', risk: 'critical' },
  { pattern: /\|\s*(bash|sh|zsh)/i, description: 'Pipe to shell attempt', risk: 'critical' },
];

// --- Glob pattern matching ---

const matchesPattern = (value: string, pattern: string): boolean => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
};

// --- Layer 1: Tool Whitelist ---

const isAllowedTool = (
  toolName: string,
  permissions: readonly ToolPermission[],
): { allowed: boolean; permission: ToolPermission | undefined } => {
  const permission = permissions.find((p) => p.name === toolName);
  if (!permission) {
    return { allowed: false, permission: undefined };
  }
  return { allowed: permission.allowed, permission };
};

// --- Layer 2: Parameter Validation ---

const validateParameters = (
  toolCall: ToolCall,
  permission: ToolPermission,
): { valid: boolean; reason?: string } => {
  const { parameters } = toolCall;
  const restrictions = permission.restrictions;

  // Database query validation: check table against restrictions
  if (restrictions && restrictions.length > 0) {
    if (permission.name === 'database_query' || (parameters.table && typeof parameters.table === 'string')) {
      const table = parameters.table as string | undefined;
      if (table) {
        for (const restriction of restrictions) {
          if (restriction.tables) {
            const tableMatches = restriction.tables.some((pattern) => matchesPattern(table, pattern));
            if (tableMatches && restriction.operations && restriction.operations.length === 0) {
              return { valid: false, reason: `Table '${table}' is restricted (no operations allowed)` };
            }
          }
        }
      }
    }

    // File path validation: check path against restrictions
    if (permission.name === 'file_read' || permission.name === 'file_write') {
      const filePath = parameters.path as string | undefined;
      if (filePath) {
        for (const restriction of restrictions) {
          if (restriction.paths) {
            const pathMatches = restriction.paths.some((pattern) => matchesPattern(filePath, pattern));
            if (pathMatches && restriction.allowed === false) {
              return { valid: false, reason: `Path '${filePath}' is restricted` };
            }
          }
        }
      }
    }
  }

  // API call URL validation: whitelist/blacklist (independent of restrictions)
  if (permission.name === 'api_call') {
    const url = parameters.url as string | undefined;
    if (url) {
      if (permission.whitelist && permission.whitelist.length > 0) {
        const whitelisted = permission.whitelist.some((pattern) => matchesPattern(url, pattern));
        if (!whitelisted) {
          return { valid: false, reason: `URL '${url}' is not in whitelist` };
        }
      }
      if (permission.blacklist && permission.blacklist.length > 0) {
        const blacklisted = permission.blacklist.some((pattern) => matchesPattern(url, pattern));
        if (blacklisted) {
          return { valid: false, reason: `URL '${url}' is blacklisted` };
        }
      }
    }
  }

  return { valid: true };
};

// --- Layer 3: Permission Scope ---

const checkPermissionScope = (
  toolCall: ToolCall,
  permission: ToolPermission,
): { allowed: boolean; reason?: string } => {
  const { parameters } = toolCall;
  const restrictions = permission.restrictions;

  if (!restrictions || restrictions.length === 0) {
    return { allowed: true };
  }

  // Database: check operation against allowed operations for matched table
  if (permission.name === 'database_query' || (parameters.table && parameters.operation)) {
    const table = parameters.table as string | undefined;
    const operation = parameters.operation as string | undefined;

    if (table && operation) {
      for (const restriction of restrictions) {
        if (restriction.tables) {
          const tableMatches = restriction.tables.some((pattern) => matchesPattern(table, pattern));
          if (tableMatches && restriction.operations) {
            if (restriction.operations.length === 0) {
              return { allowed: false, reason: `No operations allowed on table matching '${restriction.tables.join(', ')}'` };
            }
            if (!restriction.operations.includes(operation.toLowerCase())) {
              return { allowed: false, reason: `Operation '${operation}' not allowed on table '${table}' (allowed: ${restriction.operations.join(', ')})` };
            }
          }
        }
      }
    }
  }

  // File: path restriction already handled in Layer 2
  // API: whitelist/blacklist already handled in Layer 2

  return { allowed: true };
};

// --- Layer 4: Risk Assessment ---

const assessRisk = (
  toolCall: ToolCall,
): { riskLevel: RiskLevel; details?: string } => {
  const paramValues = extractStringValues(toolCall.parameters);

  for (const value of paramValues) {
    for (const { pattern, description, risk } of DANGEROUS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(value)) {
        return { riskLevel: risk, details: `${description} in parameter value` };
      }
    }
  }

  return { riskLevel: 'low' };
};

const extractStringValues = (obj: Record<string, unknown>): string[] => {
  const values: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      values.push(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      values.push(...extractStringValues(value as Record<string, unknown>));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          values.push(item);
        }
      }
    }
  }
  return values;
};

// --- Main Validation Function ---

export const validateToolCall = (
  toolCall: ToolCall,
  permissionConfig: AgentPermissionConfig,
): ToolCallDecision => {
  const startTime = Date.now();

  // Layer 1: Tool Whitelist Check
  const { allowed, permission } = isAllowedTool(toolCall.toolName, permissionConfig.tools);
  if (!allowed || !permission) {
    return {
      allowed: false,
      reason: `Tool '${toolCall.toolName}' is not in the allowed tool list`,
      denialType: 'tool_not_whitelisted',
      riskLevel: 'high',
      matchedRestrictions: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // Layer 2: Parameter Validation
  const paramResult = validateParameters(toolCall, permission);
  if (!paramResult.valid) {
    return {
      allowed: false,
      reason: paramResult.reason,
      denialType: 'parameter_validation_failed',
      riskLevel: 'high',
      matchedRestrictions: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // Layer 3: Permission Scope Check
  const scopeResult = checkPermissionScope(toolCall, permission);
  if (!scopeResult.allowed) {
    return {
      allowed: false,
      reason: scopeResult.reason,
      denialType: 'permission_denied',
      riskLevel: 'medium',
      matchedRestrictions: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // Layer 4: Risk Assessment
  const riskResult = assessRisk(toolCall);
  if (riskResult.riskLevel === 'critical' || riskResult.riskLevel === 'high') {
    return {
      allowed: false,
      reason: riskResult.details ?? 'High risk tool call detected',
      denialType: 'high_risk',
      riskLevel: riskResult.riskLevel,
      matchedRestrictions: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // All layers passed
  return {
    allowed: true,
    riskLevel: riskResult.riskLevel,
    latencyMs: Date.now() - startTime,
  };
};
