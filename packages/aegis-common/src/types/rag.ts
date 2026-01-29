import type { ThreatType } from './detection.js';

export type RAGThreatType = Extract<
  ThreatType,
  'hidden_directive' | 'invisible_characters' | 'encoding_attack' | 'prompt_injection'
>;

export interface RAGDocument {
  readonly content: string;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RAGThreatFinding {
  readonly type: RAGThreatType;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
  readonly position?: { start: number; end: number };
  readonly matched?: string;
}

export interface RAGScanResult {
  readonly isSafe: boolean;
  readonly findings: RAGThreatFinding[];
  readonly riskScore: number;
  readonly scannedLength: number;
}

export interface RAGScanRequest {
  readonly content: string;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RAGScanResponse {
  readonly requestId: string;
  readonly result: RAGScanResult;
}

// --- Embedding Integrity ---

export interface EmbeddingVector {
  readonly id: string;
  readonly values: number[];
  readonly dimension: number;
  readonly source?: string;
  readonly checksum?: string;
}

export interface EmbeddingIntegrityResult {
  readonly isValid: boolean;
  readonly issues: EmbeddingIssue[];
  readonly stats: EmbeddingStats;
}

export interface EmbeddingIssue {
  readonly type: 'dimension_mismatch' | 'nan_values' | 'inf_values' | 'zero_vector' | 'outlier' | 'checksum_mismatch';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
  readonly affectedIndices?: number[];
}

export interface EmbeddingStats {
  readonly dimension: number;
  readonly magnitude: number;
  readonly mean: number;
  readonly std: number;
  readonly min: number;
  readonly max: number;
  readonly sparsity: number;
}

// --- Semantic Drift Detection ---

export interface SemanticDriftResult {
  readonly hasDrift: boolean;
  readonly driftScore: number;
  readonly driftType?: 'content_divergence' | 'topic_shift' | 'style_change' | 'injection_suspected';
  readonly details?: string;
  readonly originalSignature?: ContentSignature;
  readonly currentSignature?: ContentSignature;
}

export interface ContentSignature {
  readonly wordCount: number;
  readonly avgWordLength: number;
  readonly vocabularyRichness: number;
  readonly topKeywords: string[];
  readonly languageDistribution: Record<string, number>;
  readonly sentimentIndicators: Record<string, number>;
}

// --- Document Provenance ---

export type TrustLevel = 'verified' | 'trusted' | 'standard' | 'untrusted' | 'unknown';

export interface DocumentProvenance {
  readonly documentId: string;
  readonly source: DocumentSource;
  readonly chain: ProvenanceEntry[];
  readonly trustScore: number;
  readonly trustLevel: TrustLevel;
  readonly lastVerified?: string;
}

export interface DocumentSource {
  readonly type: 'internal' | 'external' | 'user_upload' | 'api' | 'crawl';
  readonly origin: string;
  readonly domain?: string;
  readonly verified: boolean;
  readonly trustWeight: number;
}

export interface ProvenanceEntry {
  readonly timestamp: string;
  readonly action: 'created' | 'modified' | 'chunked' | 'embedded' | 'accessed' | 'verified';
  readonly actor: string;
  readonly details?: string;
  readonly contentHash?: string;
}

export interface ProvenanceValidationResult {
  readonly isValid: boolean;
  readonly trustLevel: TrustLevel;
  readonly trustScore: number;
  readonly issues: ProvenanceIssue[];
  readonly recommendations: string[];
}

export interface ProvenanceIssue {
  readonly type: 'missing_source' | 'broken_chain' | 'untrusted_origin' | 'hash_mismatch' | 'expired_verification';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
}
