/**
 * Embedding utilities for semantic analysis.
 * Provides cosine similarity, normalization, and matching functions.
 */

import type { IntentType, SemanticMatch } from '@aegis/common';

export interface ReferenceEmbedding {
  readonly id: string;
  readonly name: string;
  readonly intent: IntentType;
  readonly embedding: Float32Array;
  readonly sourceText: string;
}

/**
 * Computes cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
};

/**
 * L2 normalizes an embedding vector (unit length).
 */
export const normalizeEmbedding = (embedding: Float32Array): Float32Array => {
  let norm = 0;
  for (let i = 0; i < embedding.length; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return embedding;

  const normalized = new Float32Array(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    normalized[i] = embedding[i] / norm;
  }
  return normalized;
};

/**
 * Finds top-k most similar reference embeddings.
 */
export const findTopMatches = (
  queryEmbedding: Float32Array,
  references: ReferenceEmbedding[],
  k: number = 5,
  threshold: number = 0.5,
): SemanticMatch[] => {
  const matches: Array<SemanticMatch & { similarity: number }> = [];

  for (const ref of references) {
    const similarity = cosineSimilarity(queryEmbedding, ref.embedding);
    if (similarity >= threshold) {
      matches.push({
        referenceId: ref.id,
        referenceName: ref.name,
        similarity,
        intentType: ref.intent,
      });
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.similarity - a.similarity);

  // Return top k
  return matches.slice(0, k);
};

/**
 * Determines the dominant intent from a list of matches.
 * Uses weighted voting based on similarity scores.
 */
export const getDominantIntent = (
  matches: SemanticMatch[],
  minConfidence: number = 0.6,
): { intent: IntentType; confidence: number } => {
  if (matches.length === 0) {
    return { intent: 'benign', confidence: 1.0 };
  }

  // Aggregate scores by intent
  const intentScores = new Map<IntentType, number>();

  for (const match of matches) {
    const currentScore = intentScores.get(match.intentType) ?? 0;
    intentScores.set(match.intentType, currentScore + match.similarity);
  }

  // Find highest scoring intent
  let maxIntent: IntentType = 'benign';
  let maxScore = 0;
  let totalScore = 0;

  for (const [intent, score] of intentScores) {
    totalScore += score;
    if (score > maxScore) {
      maxScore = score;
      maxIntent = intent;
    }
  }

  // Normalize confidence
  const confidence = totalScore > 0 ? maxScore / totalScore : 0;

  // Return benign if confidence is too low
  if (confidence < minConfidence && maxIntent !== 'benign') {
    return { intent: 'benign', confidence: 1.0 - confidence };
  }

  return { intent: maxIntent, confidence };
};

/**
 * Simple hash function for embedding cache keys.
 */
export const hashText = (text: string): string => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
};
