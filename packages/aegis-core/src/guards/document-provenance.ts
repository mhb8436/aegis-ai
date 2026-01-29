import { createHash } from 'crypto';
import type {
  DocumentProvenance,
  DocumentSource,
  ProvenanceEntry,
  ProvenanceValidationResult,
  ProvenanceIssue,
  TrustLevel,
} from '@aegis/common';

// Trust weights by source type
const SOURCE_TRUST_WEIGHTS: Record<DocumentSource['type'], number> = {
  internal: 1.0,
  external: 0.6,
  user_upload: 0.4,
  api: 0.7,
  crawl: 0.3,
};

// Domain trust configuration
const TRUSTED_DOMAINS = new Set([
  'gov.kr',
  'go.kr',
  'ac.kr',
  'edu',
  'org',
]);

const UNTRUSTED_DOMAINS = new Set([
  'pastebin.com',
  'temp-mail.org',
  'anonymous',
]);

// Verification expiry (7 days in milliseconds)
const VERIFICATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const computeContentHash = (content: string): string => {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
};

const extractDomain = (origin: string): string | undefined => {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    // Try to extract domain from string
    const match = origin.match(/(?:https?:\/\/)?([^/\s]+)/);
    return match?.[1];
  }
};

const getDomainTrustBonus = (domain: string | undefined): number => {
  if (!domain) return 0;

  const lowerDomain = domain.toLowerCase();

  // Check for trusted TLDs
  for (const trusted of TRUSTED_DOMAINS) {
    if (lowerDomain.endsWith(`.${trusted}`) || lowerDomain === trusted) {
      return 0.2;
    }
  }

  // Check for untrusted domains
  for (const untrusted of UNTRUSTED_DOMAINS) {
    if (lowerDomain.includes(untrusted)) {
      return -0.3;
    }
  }

  return 0;
};

export const createDocumentSource = (
  type: DocumentSource['type'],
  origin: string,
  verified: boolean = false,
): DocumentSource => {
  const domain = extractDomain(origin);
  const baseTrust = SOURCE_TRUST_WEIGHTS[type];
  const domainBonus = getDomainTrustBonus(domain);

  return {
    type,
    origin,
    domain,
    verified,
    trustWeight: Math.max(0, Math.min(1, baseTrust + domainBonus + (verified ? 0.1 : 0))),
  };
};

export const createProvenance = (
  documentId: string,
  source: DocumentSource,
  content?: string,
): DocumentProvenance => {
  const now = new Date().toISOString();
  const initialEntry: ProvenanceEntry = {
    timestamp: now,
    action: 'created',
    actor: 'system',
    contentHash: content ? computeContentHash(content) : undefined,
  };

  return {
    documentId,
    source,
    chain: [initialEntry],
    trustScore: source.trustWeight,
    trustLevel: calculateTrustLevel(source.trustWeight),
    lastVerified: source.verified ? now : undefined,
  };
};

export const addProvenanceEntry = (
  provenance: DocumentProvenance,
  action: ProvenanceEntry['action'],
  actor: string,
  content?: string,
  details?: string,
): DocumentProvenance => {
  const entry: ProvenanceEntry = {
    timestamp: new Date().toISOString(),
    action,
    actor,
    details,
    contentHash: content ? computeContentHash(content) : undefined,
  };

  const updatedChain = [...provenance.chain, entry];

  // Recalculate trust based on chain integrity
  let trustAdjustment = 0;

  // Verified actions increase trust slightly
  if (action === 'verified') {
    trustAdjustment += 0.05;
  }

  // Many modifications may indicate issues
  const modificationCount = updatedChain.filter((e) => e.action === 'modified').length;
  if (modificationCount > 5) {
    trustAdjustment -= 0.1;
  }

  const newTrustScore = Math.max(0, Math.min(1, provenance.trustScore + trustAdjustment));

  return {
    ...provenance,
    chain: updatedChain,
    trustScore: newTrustScore,
    trustLevel: calculateTrustLevel(newTrustScore),
    lastVerified: action === 'verified' ? entry.timestamp : provenance.lastVerified,
  };
};

const calculateTrustLevel = (score: number): TrustLevel => {
  if (score >= 0.9) return 'verified';
  if (score >= 0.7) return 'trusted';
  if (score >= 0.4) return 'standard';
  if (score >= 0.2) return 'untrusted';
  return 'unknown';
};

export const validateProvenance = (
  provenance: DocumentProvenance,
  currentContent?: string,
): ProvenanceValidationResult => {
  const issues: ProvenanceIssue[] = [];
  const recommendations: string[] = [];

  // Check for missing source
  if (!provenance.source.origin) {
    issues.push({
      type: 'missing_source',
      severity: 'high',
      description: 'Document source origin is missing',
    });
    recommendations.push('Provide document source information');
  }

  // Check for untrusted origin
  if (provenance.source.trustWeight < 0.4) {
    issues.push({
      type: 'untrusted_origin',
      severity: 'medium',
      description: `Document source has low trust weight (${provenance.source.trustWeight.toFixed(2)})`,
    });
    recommendations.push('Consider verifying document authenticity');
  }

  // Check chain integrity
  if (provenance.chain.length === 0) {
    issues.push({
      type: 'broken_chain',
      severity: 'critical',
      description: 'Provenance chain is empty',
    });
    recommendations.push('Rebuild provenance chain from available records');
  } else {
    // Verify chain order
    for (let i = 1; i < provenance.chain.length; i++) {
      const prev = new Date(provenance.chain[i - 1].timestamp);
      const curr = new Date(provenance.chain[i].timestamp);
      if (curr < prev) {
        issues.push({
          type: 'broken_chain',
          severity: 'high',
          description: `Provenance chain has out-of-order entries at index ${i}`,
        });
        break;
      }
    }
  }

  // Check content hash if current content is provided
  if (currentContent) {
    const currentHash = computeContentHash(currentContent);
    const lastHashEntry = [...provenance.chain]
      .reverse()
      .find((e) => e.contentHash);

    if (lastHashEntry && lastHashEntry.contentHash !== currentHash) {
      issues.push({
        type: 'hash_mismatch',
        severity: 'critical',
        description: 'Current content hash does not match provenance record',
      });
      recommendations.push('Document may have been modified without proper tracking');
    }
  }

  // Check verification expiry
  if (provenance.lastVerified) {
    const lastVerified = new Date(provenance.lastVerified);
    const now = new Date();
    if (now.getTime() - lastVerified.getTime() > VERIFICATION_EXPIRY_MS) {
      issues.push({
        type: 'expired_verification',
        severity: 'low',
        description: `Last verification was ${Math.floor((now.getTime() - lastVerified.getTime()) / (24 * 60 * 60 * 1000))} days ago`,
      });
      recommendations.push('Re-verify document authenticity');
    }
  } else if (provenance.source.type === 'external' || provenance.source.type === 'crawl') {
    issues.push({
      type: 'expired_verification',
      severity: 'medium',
      description: 'External document has never been verified',
    });
    recommendations.push('Verify document authenticity before use');
  }

  // Calculate final trust based on issues
  let adjustedTrust = provenance.trustScore;
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical':
        adjustedTrust -= 0.3;
        break;
      case 'high':
        adjustedTrust -= 0.2;
        break;
      case 'medium':
        adjustedTrust -= 0.1;
        break;
      case 'low':
        adjustedTrust -= 0.05;
        break;
    }
  }
  adjustedTrust = Math.max(0, Math.min(1, adjustedTrust));

  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasHigh = issues.some((i) => i.severity === 'high');

  return {
    isValid: !hasCritical && !hasHigh,
    trustLevel: calculateTrustLevel(adjustedTrust),
    trustScore: adjustedTrust,
    issues,
    recommendations,
  };
};

export const shouldAllowAccess = (
  provenance: DocumentProvenance,
  requiredTrustLevel: TrustLevel,
): { allowed: boolean; reason?: string } => {
  const trustOrder: TrustLevel[] = ['unknown', 'untrusted', 'standard', 'trusted', 'verified'];
  const requiredIndex = trustOrder.indexOf(requiredTrustLevel);
  const currentIndex = trustOrder.indexOf(provenance.trustLevel);

  if (currentIndex >= requiredIndex) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Document trust level (${provenance.trustLevel}) is below required level (${requiredTrustLevel})`,
  };
};

export const mergeProvenanceChains = (
  primary: DocumentProvenance,
  secondary: DocumentProvenance,
): DocumentProvenance => {
  // Merge chains chronologically
  const mergedChain = [...primary.chain, ...secondary.chain]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Use lower trust score (conservative)
  const trustScore = Math.min(primary.trustScore, secondary.trustScore);

  return {
    documentId: primary.documentId,
    source: primary.source,
    chain: mergedChain,
    trustScore,
    trustLevel: calculateTrustLevel(trustScore),
    lastVerified: primary.lastVerified && secondary.lastVerified
      ? new Date(primary.lastVerified) > new Date(secondary.lastVerified)
        ? primary.lastVerified
        : secondary.lastVerified
      : primary.lastVerified ?? secondary.lastVerified,
  };
};
