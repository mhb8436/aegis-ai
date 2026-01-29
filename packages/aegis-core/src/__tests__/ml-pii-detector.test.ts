import { describe, it, expect, vi } from 'vitest';
import { detectPIIByNER } from '../ml/ml-pii-detector.js';
import type { OnnxModel, OnnxSession, ModelConfig } from '../ml/model-loader.js';
import type { WordPieceTokenizer, TokenizedInput } from '../ml/tokenizer.js';

// --- Mock helpers ---

// Labels: O=0, B-PER=1, I-PER=2, B-LOC=3, I-LOC=4, B-ORG=5, I-ORG=6
const NUM_LABELS = 7;

const createMockTokenizedInput = (length = 16): TokenizedInput => {
  const attentionMask = new BigInt64Array(length);
  // First 8 positions are valid (non-padding)
  for (let i = 0; i < 8; i++) attentionMask[i] = 1n;
  return {
    inputIds: new BigInt64Array(length),
    attentionMask,
    tokenTypeIds: new BigInt64Array(length),
  };
};

const createMockTokenizer = (seqLen = 16): WordPieceTokenizer =>
  ({
    tokenize: vi.fn().mockReturnValue(createMockTokenizedInput(seqLen)),
    vocabSize: 100,
  }) as unknown as WordPieceTokenizer;

const PII_CONFIG: ModelConfig = {
  name: 'pii-detector',
  labels: ['O', 'B-PER', 'I-PER', 'B-LOC', 'I-LOC', 'B-ORG', 'I-ORG'],
  maxLength: 16,
  threshold: 0.5,
};

/**
 * Build a logits Float32Array for a NER sequence.
 * @param labelSequence - array of label indices per position, length = seqLen
 */
const buildNERLogits = (labelSequence: number[], seqLen: number): Float32Array => {
  const logits = new Float32Array(seqLen * NUM_LABELS);
  for (let pos = 0; pos < seqLen; pos++) {
    const offset = pos * NUM_LABELS;
    // Set all logits to low value
    for (let j = 0; j < NUM_LABELS; j++) {
      logits[offset + j] = -5.0;
    }
    // Set the target label to high value
    const targetLabel = labelSequence[pos] ?? 0;
    logits[offset + targetLabel] = 5.0;
  }
  return logits;
};

const createMockSession = (logits: Float32Array): OnnxSession => ({
  run: vi.fn().mockResolvedValue({
    output: { data: logits, dims: [1, logits.length / NUM_LABELS, NUM_LABELS] },
  }),
});

const createMockModel = (labelSequence: number[], seqLen = 16): OnnxModel => {
  const logits = buildNERLogits(labelSequence, seqLen);
  return {
    session: createMockSession(logits),
    tokenizer: createMockTokenizer(seqLen),
    config: PII_CONFIG,
  };
};

describe('ML PII Detector (NER)', () => {
  it('returns empty entities for all-O predictions', async () => {
    // All positions predict O (index 0)
    const labels = Array(16).fill(0);
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('오늘 날씨가 좋습니다', model);
    expect(entities).toHaveLength(0);
  });

  it('detects a single PER entity (B-PER)', async () => {
    // Position 0: [CLS], Position 1: B-PER, Position 2: O, rest: O
    const labels = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('홍길동 안녕하세요', model);

    expect(entities.length).toBeGreaterThanOrEqual(1);
    expect(entities[0].type).toBe('PER');
    expect(entities[0].confidence).toBeGreaterThan(0);
  });

  it('merges consecutive B-PER I-PER into single entity', async () => {
    // Position 1: B-PER, Position 2: I-PER, Position 3: O
    const labels = [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('김 철수 입니다', model);

    // Should merge into one PER entity
    expect(entities.length).toBe(1);
    expect(entities[0].type).toBe('PER');
  });

  it('detects LOC entity', async () => {
    // Position 1: B-LOC, Position 2: O
    const labels = [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('서울에서 만나요', model);

    expect(entities.length).toBeGreaterThanOrEqual(1);
    expect(entities[0].type).toBe('LOC');
  });

  it('detects multiple entities of different types', async () => {
    // Position 1: B-PER, Position 2: O, Position 3: B-LOC, rest: O
    const labels = [0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('홍길동은 서울에 살고 있습니다', model);

    expect(entities.length).toBe(2);
    const types = entities.map((e) => e.type);
    expect(types).toContain('PER');
    expect(types).toContain('LOC');
  });

  it('provides confidence scores for entities', async () => {
    const labels = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('홍길동 입니다', model);

    expect(entities.length).toBeGreaterThanOrEqual(1);
    // With logits set to 5.0 for target and -5.0 for others, confidence should be very high
    expect(entities[0].confidence).toBeGreaterThan(0.9);
  });

  it('flushes entity when I-tag type mismatches current entity type', async () => {
    // Position 1: B-PER, Position 2: I-LOC (type mismatch → flush PER)
    const labels = [0, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const model = createMockModel(labels);

    const entities = await detectPIIByNER('홍길동 서울 입니다', model);

    // B-PER gets flushed when I-LOC is encountered (type mismatch)
    // I-LOC without matching B-LOC means currentEntity becomes null after flush
    expect(entities.length).toBe(1);
    expect(entities[0].type).toBe('PER');
  });
});
