import { createHash } from 'crypto';
import type {
  EmbeddingVector,
  EmbeddingIntegrityResult,
  EmbeddingIssue,
  EmbeddingStats,
} from '@aegis/common';

// Statistical thresholds for anomaly detection
const THRESHOLDS = {
  MIN_DIMENSION: 64,
  MAX_DIMENSION: 4096,
  MIN_MAGNITUDE: 0.1,
  MAX_MAGNITUDE: 100,
  MAX_SPARSITY: 0.95,
  OUTLIER_STD_MULTIPLIER: 4,
} as const;

const calculateStats = (values: number[]): EmbeddingStats => {
  const n = values.length;
  if (n === 0) {
    return {
      dimension: 0,
      magnitude: 0,
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      sparsity: 1,
    };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(variance);

  const magnitude = Math.sqrt(values.reduce((a, b) => a + b * b, 0));
  const zeroCount = values.filter((v) => Math.abs(v) < 1e-10).length;

  return {
    dimension: n,
    magnitude,
    mean,
    std,
    min: Math.min(...values),
    max: Math.max(...values),
    sparsity: zeroCount / n,
  };
};

const computeChecksum = (values: number[]): string => {
  const buffer = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => buffer.writeDoubleLE(v, i * 8));
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
};

const detectOutliers = (values: number[], stats: EmbeddingStats): number[] => {
  const threshold = stats.std * THRESHOLDS.OUTLIER_STD_MULTIPLIER;
  const outlierIndices: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] - stats.mean) > threshold) {
      outlierIndices.push(i);
    }
  }

  return outlierIndices;
};

export const verifyEmbeddingIntegrity = (
  embedding: EmbeddingVector,
  expectedDimension?: number,
): EmbeddingIntegrityResult => {
  const issues: EmbeddingIssue[] = [];
  const { values, dimension, checksum } = embedding;

  // Verify dimension consistency
  if (values.length !== dimension) {
    issues.push({
      type: 'dimension_mismatch',
      severity: 'critical',
      description: `Declared dimension (${dimension}) does not match actual values length (${values.length})`,
    });
  }

  // Check expected dimension if provided
  if (expectedDimension && values.length !== expectedDimension) {
    issues.push({
      type: 'dimension_mismatch',
      severity: 'high',
      description: `Embedding dimension (${values.length}) does not match expected (${expectedDimension})`,
    });
  }

  // Check for NaN values
  const nanIndices = values
    .map((v, i) => (Number.isNaN(v) ? i : -1))
    .filter((i) => i >= 0);
  if (nanIndices.length > 0) {
    issues.push({
      type: 'nan_values',
      severity: 'critical',
      description: `Found ${nanIndices.length} NaN values in embedding`,
      affectedIndices: nanIndices.slice(0, 10),
    });
  }

  // Check for Infinity values
  const infIndices = values
    .map((v, i) => (!Number.isFinite(v) && !Number.isNaN(v) ? i : -1))
    .filter((i) => i >= 0);
  if (infIndices.length > 0) {
    issues.push({
      type: 'inf_values',
      severity: 'critical',
      description: `Found ${infIndices.length} Infinity values in embedding`,
      affectedIndices: infIndices.slice(0, 10),
    });
  }

  // Calculate statistics
  const validValues = values.filter((v) => Number.isFinite(v));
  const stats = calculateStats(validValues);

  // Check for zero vector
  if (stats.magnitude < THRESHOLDS.MIN_MAGNITUDE) {
    issues.push({
      type: 'zero_vector',
      severity: 'high',
      description: `Embedding magnitude (${stats.magnitude.toFixed(4)}) is too small, possibly zero vector`,
    });
  }

  // Check for excessive sparsity
  if (stats.sparsity > THRESHOLDS.MAX_SPARSITY) {
    issues.push({
      type: 'zero_vector',
      severity: 'medium',
      description: `Embedding is too sparse (${(stats.sparsity * 100).toFixed(1)}% zeros)`,
    });
  }

  // Detect outliers
  const outlierIndices = detectOutliers(validValues, stats);
  if (outlierIndices.length > values.length * 0.05) {
    issues.push({
      type: 'outlier',
      severity: 'medium',
      description: `Found ${outlierIndices.length} outlier values (>${THRESHOLDS.OUTLIER_STD_MULTIPLIER} std from mean)`,
      affectedIndices: outlierIndices.slice(0, 10),
    });
  }

  // Verify checksum if provided
  if (checksum) {
    const computed = computeChecksum(values);
    if (computed !== checksum) {
      issues.push({
        type: 'checksum_mismatch',
        severity: 'critical',
        description: `Checksum mismatch: expected ${checksum}, computed ${computed}`,
      });
    }
  }

  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasHigh = issues.some((i) => i.severity === 'high');

  return {
    isValid: !hasCritical && !hasHigh,
    issues,
    stats,
  };
};

export const verifyEmbeddingBatch = (
  embeddings: EmbeddingVector[],
  expectedDimension?: number,
): { valid: EmbeddingVector[]; invalid: Array<{ embedding: EmbeddingVector; result: EmbeddingIntegrityResult }> } => {
  const valid: EmbeddingVector[] = [];
  const invalid: Array<{ embedding: EmbeddingVector; result: EmbeddingIntegrityResult }> = [];

  // Determine expected dimension from first valid embedding if not provided
  const dimension = expectedDimension ?? embeddings[0]?.values.length;

  for (const embedding of embeddings) {
    const result = verifyEmbeddingIntegrity(embedding, dimension);
    if (result.isValid) {
      valid.push(embedding);
    } else {
      invalid.push({ embedding, result });
    }
  }

  return { valid, invalid };
};

export const generateEmbeddingChecksum = (values: number[]): string => {
  return computeChecksum(values);
};
