export { WordPieceTokenizer } from './tokenizer.js';
export type { TokenizerConfig, TokenizedInput } from './tokenizer.js';

export { loadModels } from './model-loader.js';
export type { ModelRegistry, OnnxModel, OnnxSession, ModelConfig } from './model-loader.js';

export { classifyInjection } from './ml-classifier.js';
export type { ClassificationResult } from './ml-classifier.js';

export { detectPIIByNER } from './ml-pii-detector.js';
export type { NEREntity } from './ml-pii-detector.js';

export {
  cosineSimilarity,
  normalizeEmbedding,
  findTopMatches,
  getDominantIntent,
  hashText,
} from './embedding-utils.js';
export type { ReferenceEmbedding } from './embedding-utils.js';

export {
  SemanticAnalyzer,
  createPatternSemanticAnalyzer,
  createEmbeddingSemanticAnalyzer,
} from './semantic-analyzer.js';
export type { EmbeddingModel, SemanticAnalyzerOptions } from './semantic-analyzer.js';
