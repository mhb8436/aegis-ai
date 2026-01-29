import type { OnnxModel } from './model-loader.js';

export interface ClassificationResult {
  readonly label: string;
  readonly confidence: number;
  readonly probabilities: Record<string, number>;
}

const softmax = (logits: Float32Array): number[] => {
  const maxVal = Math.max(...logits);
  const exps = Array.from(logits).map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
};

export const classifyInjection = async (
  text: string,
  model: OnnxModel,
): Promise<ClassificationResult> => {
  const tokenized = model.tokenizer.tokenize(text);

  // Dynamic import for onnxruntime-node Tensor
  const ort = await import('onnxruntime-node');

  const feeds: Record<string, unknown> = {
    input_ids: new ort.Tensor('int64', tokenized.inputIds, [1, tokenized.inputIds.length]),
    attention_mask: new ort.Tensor('int64', tokenized.attentionMask, [1, tokenized.attentionMask.length]),
    token_type_ids: new ort.Tensor('int64', tokenized.tokenTypeIds, [1, tokenized.tokenTypeIds.length]),
  };

  const output = await model.session.run(feeds);

  // Get logits from the first output key
  const outputKeys = Object.keys(output);
  const logitsKey = outputKeys[0];
  const logits = output[logitsKey].data as Float32Array;

  const probs = softmax(logits);

  // Map probabilities to labels
  const probabilities: Record<string, number> = {};
  let maxIdx = 0;
  let maxProb = 0;

  for (let i = 0; i < model.config.labels.length && i < probs.length; i++) {
    probabilities[model.config.labels[i]] = probs[i];
    if (probs[i] > maxProb) {
      maxProb = probs[i];
      maxIdx = i;
    }
  }

  return {
    label: model.config.labels[maxIdx] ?? 'unknown',
    confidence: maxProb,
    probabilities,
  };
};

/** Exported for testing */
export { softmax as _softmax };
