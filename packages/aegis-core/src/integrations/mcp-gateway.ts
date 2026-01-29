import { v4 as uuidv4 } from 'uuid';
import type {
  RiskLevel,
  MCPValidateRequest,
  MCPValidateResult,
  MCPToolFinding,
  MCPToolDescriptionThreat,
  MCPTool,
} from '@aegis/common';

// --- Tool description poisoning patterns (EN + KR) ---

interface PoisoningPattern {
  readonly pattern: RegExp;
  readonly description: string;
  readonly threat: MCPToolDescriptionThreat;
  readonly severity: RiskLevel;
}

const POISONING_PATTERNS: readonly PoisoningPattern[] = [
  // Instruction injection (EN)
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|context)/i, description: 'Instruction override attempt (EN)', threat: 'instruction_injection', severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|earlier)/i, description: 'Instruction disregard attempt (EN)', threat: 'instruction_injection', severity: 'critical' },
  { pattern: /you\s+must\s+(always|never|only)/i, description: 'Mandatory instruction injection (EN)', threat: 'instruction_injection', severity: 'high' },
  { pattern: /you\s+are\s+now\s+a/i, description: 'Role reassignment attempt (EN)', threat: 'instruction_injection', severity: 'critical' },
  { pattern: /override\s+(system|safety|security)/i, description: 'System override attempt (EN)', threat: 'instruction_injection', severity: 'critical' },
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, description: 'Role pretension attempt (EN)', threat: 'instruction_injection', severity: 'high' },

  // Instruction injection (KR)
  { pattern: /이전\s*(지시|명령|규칙|지침)[을를]?\s*(무시|잊어|잊으|무효)/i, description: 'Instruction override attempt (KR)', threat: 'instruction_injection', severity: 'critical' },
  { pattern: /반드시\s*(해야|따라야|수행)/i, description: 'Mandatory instruction injection (KR)', threat: 'instruction_injection', severity: 'high' },
  { pattern: /지금부터\s*(너는|당신은|넌)\s*/i, description: 'Role reassignment attempt (KR)', threat: 'instruction_injection', severity: 'critical' },

  // Hidden directives
  { pattern: /system\s*prompt\s*[:=]/i, description: 'System prompt injection', threat: 'hidden_directive', severity: 'critical' },
  { pattern: /시스템\s*(프롬프트|명령|지시)/i, description: 'System prompt reference (KR)', threat: 'hidden_directive', severity: 'high' },
  { pattern: /<script[\s>]/i, description: 'Script tag injection', threat: 'hidden_directive', severity: 'critical' },
  { pattern: /\[INST\]|<<SYS>>|<\|im_start\|>/i, description: 'Chat template tag injection', threat: 'hidden_directive', severity: 'critical' },
];

// --- Credential exposure patterns ---

interface CredentialPattern {
  readonly pattern: RegExp;
  readonly description: string;
  readonly severity: RiskLevel;
}

const CREDENTIAL_PATTERNS: readonly CredentialPattern[] = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/, description: 'OpenAI API key detected', severity: 'critical' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, description: 'GitHub personal access token detected', severity: 'critical' },
  { pattern: /xoxb-[0-9]{10,}-[a-zA-Z0-9]+/, description: 'Slack bot token detected', severity: 'critical' },
  { pattern: /AKIA[A-Z0-9]{16}/, description: 'AWS access key detected', severity: 'critical' },
  { pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, description: 'JWT token detected', severity: 'high' },
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s]{10,}/, description: 'Database connection string detected', severity: 'critical' },
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, description: 'Private key detected', severity: 'critical' },
];

// --- Excessive scope detection ---

const DANGEROUS_SCHEMA_PROPERTIES = [
  'shell', 'exec', 'eval', 'sudo', 'admin',
  'root', 'password', 'secret', 'token', 'credential',
  'rm -', 'delete_all', 'drop_table', 'format',
];

// --- Base64 detection ---

const BASE64_PATTERN = /(?:[A-Za-z0-9+/]{4}){8,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;

const containsBase64Instruction = (text: string): { found: boolean; matched?: string } => {
  BASE64_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BASE64_PATTERN.exec(text)) !== null) {
    try {
      const decoded = Buffer.from(match[0], 'base64').toString('utf-8');
      for (const { pattern } of POISONING_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(decoded)) {
          return { found: true, matched: match[0].slice(0, 40) + (match[0].length > 40 ? '...' : '') };
        }
      }
    } catch {
      // not valid base64
    }
  }

  return { found: false };
};

// --- Tool analysis ---

const analyzeTool = (tool: MCPTool): MCPToolFinding[] => {
  const findings: MCPToolFinding[] = [];
  const textToScan = tool.description;

  // Check poisoning patterns
  for (const { pattern, description, threat, severity } of POISONING_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(textToScan);
    if (match) {
      findings.push({
        toolName: tool.name,
        threatType: threat,
        description,
        severity,
        matched: match[0],
      });
    }
  }

  // Check credential exposure in description
  for (const { pattern, description, severity } of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(textToScan);
    if (match) {
      findings.push({
        toolName: tool.name,
        threatType: 'credential_exposure',
        description,
        severity,
        matched: match[0].slice(0, 20) + '...',
      });
    }
  }

  // Check base64 encoded instructions in description
  const base64Result = containsBase64Instruction(textToScan);
  if (base64Result.found) {
    findings.push({
      toolName: tool.name,
      threatType: 'hidden_directive',
      description: 'Base64-encoded instruction detected in tool description',
      severity: 'high',
      matched: base64Result.matched,
    });
  }

  // Check excessive scope in inputSchema
  if (tool.inputSchema) {
    const schemaStr = JSON.stringify(tool.inputSchema).toLowerCase();
    for (const prop of DANGEROUS_SCHEMA_PROPERTIES) {
      if (schemaStr.includes(prop)) {
        findings.push({
          toolName: tool.name,
          threatType: 'excessive_scope',
          description: `Dangerous property '${prop}' found in tool input schema`,
          severity: 'high',
          matched: prop,
        });
      }
    }
  }

  return findings;
};

// --- Param-level credential check ---

const checkParamsForCredentials = (params: Record<string, unknown>): MCPToolFinding[] => {
  const findings: MCPToolFinding[] = [];
  const paramStr = JSON.stringify(params);

  for (const { pattern, description, severity } of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(paramStr);
    if (match) {
      findings.push({
        toolName: '_params',
        threatType: 'credential_exposure',
        description: `${description} in request params`,
        severity,
        matched: match[0].slice(0, 20) + '...',
      });
    }
  }

  return findings;
};

// --- Main validation function ---

export const validateMCPRequest = (request: MCPValidateRequest): MCPValidateResult => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const findings: MCPToolFinding[] = [];

  // Analyze each tool definition
  if (request.tools && request.tools.length > 0) {
    for (const tool of request.tools) {
      findings.push(...analyzeTool(tool));
    }
  }

  // Check params for credential exposure
  findings.push(...checkParamsForCredentials(request.params));

  const severityScores: Record<string, number> = {
    low: 0.2,
    medium: 0.4,
    high: 0.7,
    critical: 1.0,
  };

  const riskScore = findings.length > 0
    ? Math.max(...findings.map((f) => severityScores[f.severity] ?? 0))
    : 0;

  return {
    requestId,
    isSafe: findings.length === 0,
    findings,
    riskScore,
    latencyMs: Date.now() - startTime,
  };
};
