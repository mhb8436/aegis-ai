import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { WordPieceTokenizer } from './tokenizer.js';

export interface ModelConfig {
  readonly name: string;
  readonly labels: string[];
  readonly maxLength: number;
  readonly threshold: number;
}

export interface OnnxModel {
  readonly session: OnnxSession;
  readonly tokenizer: WordPieceTokenizer;
  readonly config: ModelConfig;
}

/** Minimal interface for ONNX Runtime InferenceSession */
export interface OnnxSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array | BigInt64Array; dims: number[] }>>;
}

export interface ModelRegistry {
  readonly injectionClassifier: OnnxModel | null;
  readonly piiDetector: OnnxModel | null;
  readonly isAvailable: boolean;
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const loadModelConfig = async (configPath: string, defaults: ModelConfig): Promise<ModelConfig> => {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ModelConfig>;
    return {
      name: parsed.name ?? defaults.name,
      labels: parsed.labels ?? defaults.labels,
      maxLength: parsed.maxLength ?? defaults.maxLength,
      threshold: parsed.threshold ?? defaults.threshold,
    };
  } catch {
    return defaults;
  }
};

const loadSingleModel = async (
  modelDir: string,
  defaultConfig: ModelConfig,
  configFileName: string,
): Promise<OnnxModel | null> => {
  const modelPath = path.join(modelDir, 'model.onnx');
  const vocabPath = path.join(modelDir, 'vocab.txt');
  const configPath = path.join(modelDir, configFileName);

  const [modelExists, vocabExists] = await Promise.all([
    fileExists(modelPath),
    fileExists(vocabPath),
  ]);

  if (!modelExists || !vocabExists) {
    return null;
  }

  try {
    // Dynamic import of onnxruntime-node
    const ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(modelPath) as unknown as OnnxSession;

    const config = await loadModelConfig(configPath, defaultConfig);
    const tokenizer = await WordPieceTokenizer.fromVocab({
      vocabPath,
      maxLength: config.maxLength,
    });

    return { session, tokenizer, config };
  } catch {
    return null;
  }
};

const INJECTION_DEFAULTS: ModelConfig = {
  name: 'injection-classifier',
  labels: ['normal', 'direct_injection', 'indirect_injection', 'jailbreak', 'data_exfiltration'],
  maxLength: 512,
  threshold: 0.7,
};

const PII_DEFAULTS: ModelConfig = {
  name: 'pii-detector',
  labels: ['O', 'B-PER', 'I-PER', 'B-LOC', 'I-LOC', 'B-ORG', 'I-ORG'],
  maxLength: 512,
  threshold: 0.5,
};

export const loadModels = async (modelDir: string): Promise<ModelRegistry> => {
  const [injectionClassifier, piiDetector] = await Promise.all([
    loadSingleModel(
      path.join(modelDir, 'injection-classifier'),
      INJECTION_DEFAULTS,
      'config.json',
    ),
    loadSingleModel(
      path.join(modelDir, 'pii-detector'),
      PII_DEFAULTS,
      'label_map.json',
    ),
  ]);

  return {
    injectionClassifier,
    piiDetector,
    isAvailable: injectionClassifier !== null || piiDetector !== null,
  };
};
