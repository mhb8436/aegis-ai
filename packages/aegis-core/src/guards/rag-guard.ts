import type { RAGDocument, RAGScanResult, RAGThreatFinding } from '@aegis/common';

// Zero-width and invisible Unicode characters
const INVISIBLE_CHARS: Array<{ code: number; name: string }> = [
  { code: 0x200b, name: 'Zero Width Space' },
  { code: 0x200c, name: 'Zero Width Non-Joiner' },
  { code: 0x200d, name: 'Zero Width Joiner' },
  { code: 0x200e, name: 'Left-to-Right Mark' },
  { code: 0x200f, name: 'Right-to-Left Mark' },
  { code: 0x2060, name: 'Word Joiner' },
  { code: 0x2061, name: 'Function Application' },
  { code: 0x2062, name: 'Invisible Times' },
  { code: 0x2063, name: 'Invisible Separator' },
  { code: 0x2064, name: 'Invisible Plus' },
  { code: 0xfeff, name: 'Zero Width No-Break Space' },
  { code: 0x00ad, name: 'Soft Hyphen' },
];

const INVISIBLE_REGEX = new RegExp(
  `[${INVISIBLE_CHARS.map((c) => `\\u${c.code.toString(16).padStart(4, '0')}`).join('')}]`,
  'g',
);

// Prompt injection directive patterns (EN + KR)
const DIRECTIVE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\[INST\]/gi, description: 'Llama instruction tag' },
  { pattern: /<<SYS>>/gi, description: 'Llama system tag' },
  { pattern: /<\|im_start\|>/gi, description: 'ChatML start tag' },
  { pattern: /<\|im_end\|>/gi, description: 'ChatML end tag' },
  { pattern: /\bignore\s+(all\s+)?previous\s+instructions?\b/gi, description: 'Instruction override (EN)' },
  { pattern: /\bforget\s+(all\s+)?(your\s+)?previous\s+(instructions?|rules?|context)\b/gi, description: 'Instruction override (EN)' },
  { pattern: /\byou\s+are\s+now\s+/gi, description: 'Role reassignment (EN)' },
  { pattern: /\bact\s+as\s+(a\s+|an\s+)?/gi, description: 'Role injection (EN)' },
  { pattern: /\bdo\s+not\s+follow\s+(any\s+)?(previous|prior|earlier)\b/gi, description: 'Instruction override (EN)' },
  { pattern: /\bdisregard\s+(all\s+)?(previous|prior|earlier)\b/gi, description: 'Instruction override (EN)' },
  { pattern: /\bsystem\s*prompt\s*[:=]/gi, description: 'System prompt injection' },
  { pattern: /이전\s*(지시|명령|규칙|지침)[을를]?\s*(무시|잊어|잊으|무효)/gi, description: 'Instruction override (KR)' },
  { pattern: /지금부터\s*(너는|당신은|넌)\s*/gi, description: 'Role reassignment (KR)' },
  { pattern: /(역할|모드)(을|를)\s*(변경|바꿔|전환)/gi, description: 'Role change (KR)' },
  { pattern: /시스템\s*(프롬프트|명령|지시)/gi, description: 'System prompt reference (KR)' },
  // HTML/XML comment hidden directives
  { pattern: /<!--[\s\S]*?(?:system|ignore|override|admin|sudo|root)[\s\S]*?-->/gi, description: 'Hidden directive in HTML comment' },
  { pattern: /<!--[\s\S]*?(?:지시|명령|무시|관리자)[\s\S]*?-->/gi, description: 'Hidden directive in HTML comment (KR)' },
];

// Base64 encoded instruction patterns
const BASE64_PATTERN = /(?:[A-Za-z0-9+/]{4}){8,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;

const isLikelyBase64Instruction = (encoded: string): boolean => {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    // Check if decoded content looks like an instruction
    return DIRECTIVE_PATTERNS.some((p) => p.pattern.test(decoded));
  } catch {
    return false;
  }
};

// Homoglyph detection: characters that look like Latin but are from other scripts
const HOMOGLYPH_RANGES: Array<[number, number, string]> = [
  [0x0400, 0x04ff, 'Cyrillic'],
  [0xff01, 0xff5e, 'Fullwidth'],
  [0x2100, 0x214f, 'Letterlike Symbols'],
];

const hasHomoglyphs = (text: string): { found: boolean; examples: string[] } => {
  const examples: string[] = [];
  const latinWords = text.match(/[a-zA-Z]{3,}/g) ?? [];
  if (latinWords.length === 0) return { found: false, examples };

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (const [start, end, script] of HOMOGLYPH_RANGES) {
      if (code >= start && code <= end) {
        const context = text.slice(Math.max(0, i - 5), Math.min(text.length, i + 6));
        examples.push(`${script} char U+${code.toString(16).padStart(4, '0')} near "${context}"`);
        if (examples.length >= 3) return { found: true, examples };
      }
    }
  }

  return { found: examples.length > 0, examples };
};

const detectInvisibleCharacters = (content: string): RAGThreatFinding[] => {
  const findings: RAGThreatFinding[] = [];
  let match: RegExpExecArray | null;

  INVISIBLE_REGEX.lastIndex = 0;
  const positions: number[] = [];

  while ((match = INVISIBLE_REGEX.exec(content)) !== null) {
    positions.push(match.index);
    if (positions.length >= 50) break;
  }

  if (positions.length > 0) {
    const charNames = positions.slice(0, 5).map((pos) => {
      const code = content.charCodeAt(pos);
      const info = INVISIBLE_CHARS.find((c) => c.code === code);
      return info?.name ?? `U+${code.toString(16).padStart(4, '0')}`;
    });

    findings.push({
      type: 'invisible_characters',
      severity: positions.length > 10 ? 'high' : 'medium',
      description: `Found ${positions.length} invisible character(s): ${charNames.join(', ')}`,
      position: { start: positions[0], end: positions[positions.length - 1] + 1 },
    });
  }

  return findings;
};

const detectHiddenDirectives = (content: string): RAGThreatFinding[] => {
  const findings: RAGThreatFinding[] = [];

  for (const { pattern, description } of DIRECTIVE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      findings.push({
        type: 'hidden_directive',
        severity: 'critical',
        description: `Hidden directive detected: ${description}`,
        position: { start: match.index, end: match.index + match[0].length },
        matched: match[0],
      });
    }
  }

  return findings;
};

const detectEncodingAttacks = (content: string): RAGThreatFinding[] => {
  const findings: RAGThreatFinding[] = [];

  // Base64 encoded instructions
  BASE64_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BASE64_PATTERN.exec(content)) !== null) {
    if (isLikelyBase64Instruction(match[0])) {
      findings.push({
        type: 'encoding_attack',
        severity: 'high',
        description: 'Base64-encoded instruction detected in document',
        position: { start: match.index, end: match.index + match[0].length },
        matched: match[0].slice(0, 40) + (match[0].length > 40 ? '...' : ''),
      });
    }
  }

  // Homoglyph attacks
  const homoglyphs = hasHomoglyphs(content);
  if (homoglyphs.found) {
    findings.push({
      type: 'encoding_attack',
      severity: 'medium',
      description: `Homoglyph characters detected: ${homoglyphs.examples.join('; ')}`,
    });
  }

  return findings;
};

export const scanDocument = (document: RAGDocument): RAGScanResult => {
  const { content } = document;
  const findings: RAGThreatFinding[] = [];

  findings.push(...detectInvisibleCharacters(content));
  findings.push(...detectHiddenDirectives(content));
  findings.push(...detectEncodingAttacks(content));

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
    isSafe: findings.length === 0,
    findings,
    riskScore,
    scannedLength: content.length,
  };
};
