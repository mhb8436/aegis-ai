/**
 * Sensitive Data Detector
 *
 * Detects sensitive information in text:
 * - Credentials: API keys, tokens, passwords, private keys
 * - Internal Systems: internal URLs, file paths, environment variables
 * - Custom patterns: organization-specific patterns
 */

import type { SensitiveType, SensitiveCategory, SensitiveFinding } from '@aegis/common';

// ============================================
// Types
// ============================================

export interface SensitivePattern {
  readonly id: string;
  readonly type: SensitiveType;
  readonly category: SensitiveCategory;
  readonly pattern: RegExp;
  readonly description: string;
  readonly maskFormat: string;
  readonly isActive: boolean;
}

export interface SensitiveDataDetectorOptions {
  readonly enableCredentials?: boolean;
  readonly enableInternal?: boolean;
  readonly customPatterns?: SensitivePattern[];
}

// ============================================
// Default Patterns
// ============================================

const CREDENTIAL_PATTERNS: Omit<SensitivePattern, 'id'>[] = [
  // API Keys
  {
    type: 'API_KEY',
    category: 'credential',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    description: 'OpenAI API key',
    maskFormat: 'sk-****',
    isActive: true,
  },
  {
    type: 'API_KEY',
    category: 'credential',
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    description: 'Google API key',
    maskFormat: 'AIza****',
    isActive: true,
  },
  {
    type: 'API_KEY',
    category: 'credential',
    pattern: /sk-ant-[a-zA-Z0-9-]{80,}/g,
    description: 'Anthropic API key',
    maskFormat: 'sk-ant-****',
    isActive: true,
  },
  // Access Tokens
  {
    type: 'ACCESS_TOKEN',
    category: 'credential',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    description: 'GitHub personal access token',
    maskFormat: 'ghp_****',
    isActive: true,
  },
  {
    type: 'ACCESS_TOKEN',
    category: 'credential',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    description: 'GitHub OAuth token',
    maskFormat: 'gho_****',
    isActive: true,
  },
  {
    type: 'ACCESS_TOKEN',
    category: 'credential',
    pattern: /ghu_[a-zA-Z0-9]{36}/g,
    description: 'GitHub user-to-server token',
    maskFormat: 'ghu_****',
    isActive: true,
  },
  {
    type: 'ACCESS_TOKEN',
    category: 'credential',
    pattern: /xoxb-[0-9]{10,}-[a-zA-Z0-9-]+/g,
    description: 'Slack bot token',
    maskFormat: 'xoxb-****',
    isActive: true,
  },
  {
    type: 'ACCESS_TOKEN',
    category: 'credential',
    pattern: /xoxp-[0-9]{10,}-[a-zA-Z0-9-]+/g,
    description: 'Slack user token',
    maskFormat: 'xoxp-****',
    isActive: true,
  },
  // AWS Credentials
  {
    type: 'AWS_CREDENTIAL',
    category: 'credential',
    pattern: /AKIA[A-Z0-9]{16}/g,
    description: 'AWS access key ID',
    maskFormat: 'AKIA****',
    isActive: true,
  },
  {
    type: 'AWS_CREDENTIAL',
    category: 'credential',
    pattern: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi,
    description: 'AWS secret access key',
    maskFormat: 'aws_secret_access_key=****',
    isActive: true,
  },
  // JWT Tokens
  {
    type: 'JWT_TOKEN',
    category: 'credential',
    pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
    description: 'JWT token',
    maskFormat: 'eyJ****',
    isActive: true,
  },
  // Private Keys
  {
    type: 'PRIVATE_KEY',
    category: 'credential',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
    description: 'Private key (PEM format)',
    maskFormat: '-----BEGIN PRIVATE KEY-----****-----END PRIVATE KEY-----',
    isActive: true,
  },
  {
    type: 'PRIVATE_KEY',
    category: 'credential',
    pattern: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+EC\s+PRIVATE\s+KEY-----/g,
    description: 'EC private key',
    maskFormat: '-----BEGIN EC PRIVATE KEY-----****',
    isActive: true,
  },
  // Database Connection Strings
  {
    type: 'DB_CONNECTION',
    category: 'credential',
    pattern: /(mongodb|postgres|postgresql|mysql|redis|mssql):\/\/[^\s'"]{10,}/gi,
    description: 'Database connection string',
    maskFormat: '****://****',
    isActive: true,
  },
  // Passwords
  {
    type: 'PASSWORD',
    category: 'credential',
    pattern: /password\s*[=:]\s*["'][^"']{8,}["']/gi,
    description: 'Password in config',
    maskFormat: 'password=****',
    isActive: true,
  },
  {
    type: 'PASSWORD',
    category: 'credential',
    pattern: /passwd\s*[=:]\s*["'][^"']{8,}["']/gi,
    description: 'Password (passwd) in config',
    maskFormat: 'passwd=****',
    isActive: true,
  },
];

const INTERNAL_PATTERNS: Omit<SensitivePattern, 'id'>[] = [
  // Internal URLs
  {
    type: 'INTERNAL_URL',
    category: 'internal',
    pattern: /https?:\/\/localhost(:\d+)?[^\s'"]*/gi,
    description: 'Localhost URL',
    maskFormat: 'http://localhost/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_URL',
    category: 'internal',
    pattern: /https?:\/\/127\.0\.0\.1(:\d+)?[^\s'"]*/gi,
    description: 'Loopback IP URL',
    maskFormat: 'http://127.0.0.1/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_URL',
    category: 'internal',
    pattern: /https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?[^\s'"]*/gi,
    description: 'Private IP (10.x.x.x)',
    maskFormat: 'http://10.x.x.x/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_URL',
    category: 'internal',
    pattern: /https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?[^\s'"]*/gi,
    description: 'Private IP (192.168.x.x)',
    maskFormat: 'http://192.168.x.x/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_URL',
    category: 'internal',
    pattern: /https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?[^\s'"]*/gi,
    description: 'Private IP (172.16-31.x.x)',
    maskFormat: 'http://172.x.x.x/****',
    isActive: true,
  },
  // Internal Paths
  {
    type: 'INTERNAL_PATH',
    category: 'internal',
    pattern: /\/etc\/[a-zA-Z0-9_\-./]{3,}/g,
    description: 'Unix /etc path',
    maskFormat: '/etc/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_PATH',
    category: 'internal',
    pattern: /\/var\/[a-zA-Z0-9_\-./]{3,}/g,
    description: 'Unix /var path',
    maskFormat: '/var/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_PATH',
    category: 'internal',
    pattern: /\/home\/[a-zA-Z0-9_\-./]{3,}/g,
    description: 'Unix /home path',
    maskFormat: '/home/****',
    isActive: true,
  },
  {
    type: 'INTERNAL_PATH',
    category: 'internal',
    pattern: /C:\\Users\\[a-zA-Z0-9_\-\\]{3,}/gi,
    description: 'Windows user path',
    maskFormat: 'C:\\Users\\****',
    isActive: true,
  },
  // Environment Variables (with values)
  {
    type: 'ENV_VARIABLE',
    category: 'internal',
    pattern: /\$\{([A-Z_][A-Z0-9_]{2,})\}/g,
    description: 'Environment variable (${VAR})',
    maskFormat: '${****}',
    isActive: true,
  },
  {
    type: 'ENV_VARIABLE',
    category: 'internal',
    pattern: /\$([A-Z_][A-Z0-9_]{2,})\b/g,
    description: 'Environment variable ($VAR)',
    maskFormat: '$****',
    isActive: true,
  },
];

// ============================================
// SensitiveDataDetector Class
// ============================================

export class SensitiveDataDetector {
  private patterns: SensitivePattern[] = [];
  private readonly options: Required<SensitiveDataDetectorOptions>;

  constructor(options: SensitiveDataDetectorOptions = {}) {
    this.options = {
      enableCredentials: options.enableCredentials ?? true,
      enableInternal: options.enableInternal ?? true,
      customPatterns: options.customPatterns ?? [],
    };

    this.initializePatterns();
  }

  /**
   * Initializes built-in and custom patterns.
   */
  private initializePatterns(): void {
    let idCounter = 0;

    // Add credential patterns
    if (this.options.enableCredentials) {
      for (const p of CREDENTIAL_PATTERNS) {
        this.patterns.push({
          ...p,
          id: `cred_${++idCounter}`,
        });
      }
    }

    // Add internal patterns
    if (this.options.enableInternal) {
      for (const p of INTERNAL_PATTERNS) {
        this.patterns.push({
          ...p,
          id: `internal_${++idCounter}`,
        });
      }
    }

    // Add custom patterns
    for (const p of this.options.customPatterns) {
      this.patterns.push(p);
    }
  }

  /**
   * Detects sensitive data in text.
   */
  detect(text: string): SensitiveFinding[] {
    const findings: SensitiveFinding[] = [];

    for (const pattern of this.patterns) {
      if (!pattern.isActive) continue;

      // Reset regex lastIndex for global patterns
      pattern.pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.pattern.exec(text)) !== null) {
        const value = match[0];
        const start = match.index;
        const end = start + value.length;

        // Create masked value
        const maskedValue = this.maskValue(value, pattern);

        findings.push({
          type: pattern.type,
          category: pattern.category,
          value,
          start,
          end,
          confidence: 1.0, // Pattern match is certain
          description: pattern.description,
          maskedValue,
        });

        // Prevent infinite loop for zero-length matches
        if (match[0].length === 0) {
          pattern.pattern.lastIndex++;
        }
      }
    }

    // Sort by start position
    findings.sort((a, b) => a.start - b.start);

    // Remove duplicates (same position, same type)
    return this.deduplicateFindings(findings);
  }

  /**
   * Masks a sensitive value.
   */
  private maskValue(value: string, pattern: SensitivePattern): string {
    // For short values, mask completely
    if (value.length <= 8) {
      return '****';
    }

    // For longer values, preserve prefix for identification
    const prefix = value.slice(0, 4);
    return `${prefix}****`;
  }

  /**
   * Removes duplicate findings at the same position.
   */
  private deduplicateFindings(findings: SensitiveFinding[]): SensitiveFinding[] {
    const seen = new Set<string>();
    const result: SensitiveFinding[] = [];

    for (const f of findings) {
      const key = `${f.start}-${f.end}-${f.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(f);
      }
    }

    return result;
  }

  /**
   * Adds a custom pattern.
   */
  addCustomPattern(pattern: SensitivePattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Loads patterns from database.
   */
  loadPatterns(patterns: SensitivePattern[]): void {
    for (const pattern of patterns) {
      if (pattern.isActive) {
        this.patterns.push(pattern);
      }
    }
  }

  /**
   * Removes all custom patterns.
   */
  clearCustomPatterns(): void {
    this.patterns = this.patterns.filter(
      (p) => p.category !== 'custom',
    );
  }

  /**
   * Returns the number of active patterns.
   */
  get patternCount(): number {
    return this.patterns.filter((p) => p.isActive).length;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a sensitive data detector with default settings.
 */
export const createSensitiveDataDetector = (
  options?: SensitiveDataDetectorOptions,
): SensitiveDataDetector => {
  return new SensitiveDataDetector(options);
};

/**
 * Masks all sensitive findings in text.
 */
export const maskSensitiveText = (
  text: string,
  findings: SensitiveFinding[],
): string => {
  if (findings.length === 0) return text;

  // Sort by start position descending to maintain correct offsets
  const sorted = [...findings].sort((a, b) => b.start - a.start);

  let result = text;
  for (const f of sorted) {
    result = result.slice(0, f.start) + f.maskedValue + result.slice(f.end);
  }

  return result;
};
