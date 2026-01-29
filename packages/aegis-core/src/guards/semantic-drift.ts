import type { ContentSignature, SemanticDriftResult } from '@aegis/common';

// Korean language detection patterns
const KOREAN_PATTERN = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g;
const ENGLISH_PATTERN = /[a-zA-Z]/g;
const CHINESE_PATTERN = /[\u4E00-\u9FFF]/g;
const JAPANESE_PATTERN = /[\u3040-\u309F\u30A0-\u30FF]/g;

// Sentiment indicator keywords
const SENTIMENT_KEYWORDS = {
  positive: ['좋다', '훌륭', '최고', '감사', '행복', 'good', 'great', 'excellent', 'thanks', 'happy', 'love'],
  negative: ['나쁘다', '싫다', '문제', '실패', '오류', 'bad', 'wrong', 'error', 'fail', 'hate', 'terrible'],
  neutral: ['그리고', '또한', '따라서', '하지만', 'and', 'also', 'however', 'but', 'therefore'],
  technical: ['API', 'SDK', '데이터', '시스템', 'server', 'database', 'function', 'class', 'method'],
  instruction: ['하세요', '해주세요', '무시', '따라', 'ignore', 'follow', 'execute', 'run', 'do this'],
};

// Thresholds for drift detection
const DRIFT_THRESHOLDS = {
  WORD_COUNT_RATIO: 0.5,
  VOCABULARY_RICHNESS_DIFF: 0.3,
  LANGUAGE_SHIFT: 0.4,
  SENTIMENT_SHIFT: 0.5,
  KEYWORD_OVERLAP: 0.2,
} as const;

const tokenize = (text: string): string[] => {
  // Simple tokenizer for Korean and English
  return text
    .toLowerCase()
    .replace(/[^\w\s\uAC00-\uD7AF]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
};

const extractKeywords = (tokens: string[], topN: number = 10): string[] => {
  const freq = new Map<string, number>();

  // Common stopwords (KR + EN)
  const stopwords = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '에서', '로', '으로', '와', '과',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
    'this', 'that', 'these', 'those', 'it', 'its', 'and', 'or', 'but', 'if',
  ]);

  for (const token of tokens) {
    if (!stopwords.has(token) && token.length > 2) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
};

const detectLanguageDistribution = (text: string): Record<string, number> => {
  const total = text.length || 1;
  const koreanMatches = text.match(KOREAN_PATTERN)?.length ?? 0;
  const englishMatches = text.match(ENGLISH_PATTERN)?.length ?? 0;
  const chineseMatches = text.match(CHINESE_PATTERN)?.length ?? 0;
  const japaneseMatches = text.match(JAPANESE_PATTERN)?.length ?? 0;
  const otherCount = total - koreanMatches - englishMatches - chineseMatches - japaneseMatches;

  return {
    korean: koreanMatches / total,
    english: englishMatches / total,
    chinese: chineseMatches / total,
    japanese: japaneseMatches / total,
    other: Math.max(0, otherCount / total),
  };
};

const detectSentimentIndicators = (text: string): Record<string, number> => {
  const lowerText = text.toLowerCase();
  const result: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(SENTIMENT_KEYWORDS)) {
    const count = keywords.filter((kw) => lowerText.includes(kw.toLowerCase())).length;
    result[category] = count / keywords.length;
  }

  return result;
};

export const generateContentSignature = (content: string): ContentSignature => {
  const tokens = tokenize(content);
  const uniqueTokens = new Set(tokens);

  return {
    wordCount: tokens.length,
    avgWordLength: tokens.length > 0
      ? tokens.reduce((sum, t) => sum + t.length, 0) / tokens.length
      : 0,
    vocabularyRichness: tokens.length > 0 ? uniqueTokens.size / tokens.length : 0,
    topKeywords: extractKeywords(tokens),
    languageDistribution: detectLanguageDistribution(content),
    sentimentIndicators: detectSentimentIndicators(content),
  };
};

const calculateKeywordOverlap = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const intersection = b.filter((w) => setA.has(w));
  return intersection.length / Math.max(a.length, b.length);
};

const calculateLanguageShift = (
  a: Record<string, number>,
  b: Record<string, number>,
): number => {
  let totalDiff = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    totalDiff += Math.abs((a[key] ?? 0) - (b[key] ?? 0));
  }

  return totalDiff / 2; // Normalize to 0-1
};

const calculateSentimentShift = (
  a: Record<string, number>,
  b: Record<string, number>,
): number => {
  let totalDiff = 0;
  let count = 0;

  for (const key of Object.keys(SENTIMENT_KEYWORDS)) {
    totalDiff += Math.abs((a[key] ?? 0) - (b[key] ?? 0));
    count++;
  }

  return count > 0 ? totalDiff / count : 0;
};

export const detectSemanticDrift = (
  originalContent: string,
  currentContent: string,
): SemanticDriftResult => {
  const originalSig = generateContentSignature(originalContent);
  const currentSig = generateContentSignature(currentContent);

  let driftScore = 0;
  let driftType: SemanticDriftResult['driftType'];
  const details: string[] = [];

  // Check word count ratio
  const wordCountRatio = originalSig.wordCount > 0
    ? Math.abs(currentSig.wordCount - originalSig.wordCount) / originalSig.wordCount
    : 0;
  if (wordCountRatio > DRIFT_THRESHOLDS.WORD_COUNT_RATIO) {
    driftScore += 0.2;
    details.push(`Word count changed by ${(wordCountRatio * 100).toFixed(0)}%`);
  }

  // Check vocabulary richness
  const richnessDiff = Math.abs(currentSig.vocabularyRichness - originalSig.vocabularyRichness);
  if (richnessDiff > DRIFT_THRESHOLDS.VOCABULARY_RICHNESS_DIFF) {
    driftScore += 0.15;
    details.push(`Vocabulary richness shifted by ${(richnessDiff * 100).toFixed(0)}%`);
    driftType = 'style_change';
  }

  // Check keyword overlap
  const keywordOverlap = calculateKeywordOverlap(
    originalSig.topKeywords,
    currentSig.topKeywords,
  );
  if (keywordOverlap < DRIFT_THRESHOLDS.KEYWORD_OVERLAP) {
    driftScore += 0.3;
    details.push(`Low keyword overlap (${(keywordOverlap * 100).toFixed(0)}%)`);
    driftType = 'topic_shift';
  }

  // Check language distribution shift
  const languageShift = calculateLanguageShift(
    originalSig.languageDistribution,
    currentSig.languageDistribution,
  );
  if (languageShift > DRIFT_THRESHOLDS.LANGUAGE_SHIFT) {
    driftScore += 0.2;
    details.push(`Language distribution shifted significantly`);
    driftType = 'content_divergence';
  }

  // Check sentiment shift
  const sentimentShift = calculateSentimentShift(
    originalSig.sentimentIndicators,
    currentSig.sentimentIndicators,
  );
  if (sentimentShift > DRIFT_THRESHOLDS.SENTIMENT_SHIFT) {
    driftScore += 0.15;
    details.push(`Sentiment indicators changed`);
  }

  // Check for injection patterns in current content
  const instructionIndicator = currentSig.sentimentIndicators.instruction ?? 0;
  const originalInstruction = originalSig.sentimentIndicators.instruction ?? 0;
  if (instructionIndicator > originalInstruction + 0.3) {
    driftScore += 0.4;
    details.push(`Suspicious instruction patterns detected`);
    driftType = 'injection_suspected';
  }

  // Normalize drift score
  driftScore = Math.min(1, driftScore);

  return {
    hasDrift: driftScore > 0.3,
    driftScore,
    driftType: driftScore > 0.3 ? driftType : undefined,
    details: details.length > 0 ? details.join('; ') : undefined,
    originalSignature: originalSig,
    currentSignature: currentSig,
  };
};

export const compareChunkConsistency = (
  chunks: Array<{ id: string; content: string }>,
): Array<{ chunkId: string; driftResult: SemanticDriftResult }> => {
  if (chunks.length < 2) return [];

  const results: Array<{ chunkId: string; driftResult: SemanticDriftResult }> = [];

  // Compare each chunk with the aggregate of all chunks
  const allContent = chunks.map((c) => c.content).join(' ');
  const aggregateSig = generateContentSignature(allContent);

  for (const chunk of chunks) {
    const chunkSig = generateContentSignature(chunk.content);

    // Compare chunk against aggregate
    const keywordOverlap = calculateKeywordOverlap(
      aggregateSig.topKeywords,
      chunkSig.topKeywords,
    );

    const languageShift = calculateLanguageShift(
      aggregateSig.languageDistribution,
      chunkSig.languageDistribution,
    );

    let driftScore = 0;
    const details: string[] = [];
    let driftType: SemanticDriftResult['driftType'];

    if (keywordOverlap < 0.1) {
      driftScore += 0.4;
      details.push('Chunk keywords differ significantly from document');
      driftType = 'topic_shift';
    }

    if (languageShift > 0.5) {
      driftScore += 0.3;
      details.push('Chunk language differs from document');
      driftType = 'content_divergence';
    }

    // Check for injection patterns
    if ((chunkSig.sentimentIndicators.instruction ?? 0) > 0.5) {
      driftScore += 0.5;
      details.push('High instruction pattern density in chunk');
      driftType = 'injection_suspected';
    }

    driftScore = Math.min(1, driftScore);

    if (driftScore > 0.2) {
      results.push({
        chunkId: chunk.id,
        driftResult: {
          hasDrift: true,
          driftScore,
          driftType,
          details: details.join('; '),
          currentSignature: chunkSig,
        },
      });
    }
  }

  return results;
};
