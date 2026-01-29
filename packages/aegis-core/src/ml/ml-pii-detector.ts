import type { OnnxModel } from './model-loader.js';

export interface NEREntity {
  readonly text: string;
  readonly type: 'PER' | 'LOC' | 'ORG';
  readonly start: number;
  readonly end: number;
  readonly confidence: number;
}

type NERLabel = 'O' | 'B-PER' | 'I-PER' | 'B-LOC' | 'I-LOC' | 'B-ORG' | 'I-ORG';

const isBeginTag = (label: string): boolean => label.startsWith('B-');
const isInsideTag = (label: string): boolean => label.startsWith('I-');

const getEntityType = (label: string): 'PER' | 'LOC' | 'ORG' | null => {
  const parts = label.split('-');
  if (parts.length < 2) return null;
  const t = parts[1];
  if (t === 'PER' || t === 'LOC' || t === 'ORG') return t;
  return null;
};

const argmax = (arr: Float32Array, offset: number, length: number): number => {
  let maxIdx = 0;
  let maxVal = arr[offset];
  for (let i = 1; i < length; i++) {
    if (arr[offset + i] > maxVal) {
      maxVal = arr[offset + i];
      maxIdx = i;
    }
  }
  return maxIdx;
};

const getConfidence = (arr: Float32Array, offset: number, length: number, idx: number): number => {
  // softmax for single position
  const maxVal = Math.max(...Array.from(arr.slice(offset, offset + length)));
  const exps = Array.from(arr.slice(offset, offset + length)).map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps[idx] / sum;
};

/**
 * Reconstruct character offsets from token-level predictions.
 * This is a simplified approach: we split the text into whitespace-delimited words
 * and map predicted labels back to original text positions.
 */
const buildCharOffsets = (text: string): Array<{ word: string; start: number; end: number }> => {
  const offsets: Array<{ word: string; start: number; end: number }> = [];
  let i = 0;

  while (i < text.length) {
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;

    const start = i;
    while (i < text.length && !/\s/.test(text[i])) i++;

    offsets.push({
      word: text.slice(start, i),
      start,
      end: i,
    });
  }

  return offsets;
};

export const detectPIIByNER = async (
  text: string,
  model: OnnxModel,
): Promise<NEREntity[]> => {
  const tokenized = model.tokenizer.tokenize(text);

  // Dynamic import for onnxruntime-node Tensor
  const ort = await import('onnxruntime-node');

  const feeds: Record<string, unknown> = {
    input_ids: new ort.Tensor('int64', tokenized.inputIds, [1, tokenized.inputIds.length]),
    attention_mask: new ort.Tensor('int64', tokenized.attentionMask, [1, tokenized.attentionMask.length]),
    token_type_ids: new ort.Tensor('int64', tokenized.tokenTypeIds, [1, tokenized.tokenTypeIds.length]),
  };

  const output = await model.session.run(feeds);

  const outputKeys = Object.keys(output);
  const logitsKey = outputKeys[0];
  const logits = output[logitsKey].data as Float32Array;
  const seqLen = tokenized.inputIds.length;
  const numLabels = model.config.labels.length;

  // Decode BIO tags (skip [CLS] at position 0 and [SEP])
  const predictions: Array<{ label: NERLabel; confidence: number }> = [];
  for (let pos = 1; pos < seqLen; pos++) {
    // Stop if attention_mask is 0 (padding) or we hit the SEP token
    if (tokenized.attentionMask[pos] === 0n) break;

    const offset = pos * numLabels;
    const idx = argmax(logits, offset, numLabels);
    const conf = getConfidence(logits, offset, numLabels, idx);
    const label = (model.config.labels[idx] ?? 'O') as NERLabel;
    predictions.push({ label, confidence: conf });
  }

  // Map predictions to character offsets and merge BIO spans
  const wordOffsets = buildCharOffsets(text);
  const entities: NEREntity[] = [];
  let currentEntity: { type: 'PER' | 'LOC' | 'ORG'; start: number; end: number; confidences: number[] } | null = null;

  for (let i = 0; i < Math.min(predictions.length, wordOffsets.length); i++) {
    const { label, confidence } = predictions[i];
    const wo = wordOffsets[i];

    if (isBeginTag(label)) {
      // Flush previous entity
      if (currentEntity) {
        entities.push({
          text: text.slice(currentEntity.start, currentEntity.end),
          type: currentEntity.type,
          start: currentEntity.start,
          end: currentEntity.end,
          confidence: currentEntity.confidences.reduce((a, b) => a + b, 0) / currentEntity.confidences.length,
        });
      }

      const entityType = getEntityType(label);
      if (entityType) {
        currentEntity = {
          type: entityType,
          start: wo.start,
          end: wo.end,
          confidences: [confidence],
        };
      } else {
        currentEntity = null;
      }
    } else if (isInsideTag(label) && currentEntity) {
      const entityType = getEntityType(label);
      if (entityType === currentEntity.type) {
        currentEntity.end = wo.end;
        currentEntity.confidences.push(confidence);
      } else {
        // Type mismatch, flush current
        entities.push({
          text: text.slice(currentEntity.start, currentEntity.end),
          type: currentEntity.type,
          start: currentEntity.start,
          end: currentEntity.end,
          confidence: currentEntity.confidences.reduce((a, b) => a + b, 0) / currentEntity.confidences.length,
        });
        currentEntity = null;
      }
    } else {
      // 'O' tag — flush current entity
      if (currentEntity) {
        entities.push({
          text: text.slice(currentEntity.start, currentEntity.end),
          type: currentEntity.type,
          start: currentEntity.start,
          end: currentEntity.end,
          confidence: currentEntity.confidences.reduce((a, b) => a + b, 0) / currentEntity.confidences.length,
        });
        currentEntity = null;
      }
    }
  }

  // Flush last entity
  if (currentEntity) {
    entities.push({
      text: text.slice(currentEntity.start, currentEntity.end),
      type: currentEntity.type,
      start: currentEntity.start,
      end: currentEntity.end,
      confidence: currentEntity.confidences.reduce((a, b) => a + b, 0) / currentEntity.confidences.length,
    });
  }

  return entities;
};
