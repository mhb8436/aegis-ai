import { readFile } from 'node:fs/promises';

export interface TokenizerConfig {
  readonly vocabPath: string;
  readonly maxLength: number;
  readonly unknownToken?: string;
  readonly padToken?: string;
  readonly clsToken?: string;
  readonly sepToken?: string;
}

export interface TokenizedInput {
  readonly inputIds: BigInt64Array;
  readonly attentionMask: BigInt64Array;
  readonly tokenTypeIds: BigInt64Array;
}

const DEFAULT_UNK = '[UNK]';
const DEFAULT_PAD = '[PAD]';
const DEFAULT_CLS = '[CLS]';
const DEFAULT_SEP = '[SEP]';

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly maxLength: number;
  private readonly unkId: number;
  private readonly padId: number;
  private readonly clsId: number;
  private readonly sepId: number;

  private constructor(
    vocab: Map<string, number>,
    maxLength: number,
    unkToken: string,
    padToken: string,
    clsToken: string,
    sepToken: string,
  ) {
    this.vocab = vocab;
    this.maxLength = maxLength;
    this.unkId = vocab.get(unkToken) ?? 0;
    this.padId = vocab.get(padToken) ?? 0;
    this.clsId = vocab.get(clsToken) ?? 0;
    this.sepId = vocab.get(sepToken) ?? 0;
  }

  static async fromVocab(config: TokenizerConfig): Promise<WordPieceTokenizer> {
    const content = await readFile(config.vocabPath, 'utf-8');
    const vocab = new Map<string, number>();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const token = lines[i].trim();
      if (token.length > 0) {
        vocab.set(token, i);
      }
    }

    return new WordPieceTokenizer(
      vocab,
      config.maxLength,
      config.unknownToken ?? DEFAULT_UNK,
      config.padToken ?? DEFAULT_PAD,
      config.clsToken ?? DEFAULT_CLS,
      config.sepToken ?? DEFAULT_SEP,
    );
  }

  get vocabSize(): number {
    return this.vocab.size;
  }

  tokenize(text: string): TokenizedInput {
    const tokens = this.wordPieceTokenize(text);

    // Truncate to maxLength - 2 (for CLS and SEP)
    const maxTokens = this.maxLength - 2;
    const truncated = tokens.slice(0, maxTokens);

    // Build [CLS] + tokens + [SEP]
    const ids: number[] = [this.clsId];
    for (const tokenId of truncated) {
      ids.push(tokenId);
    }
    ids.push(this.sepId);

    // Pad to maxLength
    const inputIds = new BigInt64Array(this.maxLength);
    const attentionMask = new BigInt64Array(this.maxLength);
    const tokenTypeIds = new BigInt64Array(this.maxLength);

    for (let i = 0; i < this.maxLength; i++) {
      if (i < ids.length) {
        inputIds[i] = BigInt(ids[i]);
        attentionMask[i] = 1n;
      } else {
        inputIds[i] = BigInt(this.padId);
        attentionMask[i] = 0n;
      }
      tokenTypeIds[i] = 0n;
    }

    return { inputIds, attentionMask, tokenTypeIds };
  }

  private wordPieceTokenize(text: string): number[] {
    const words = this.basicTokenize(text);
    const tokenIds: number[] = [];

    for (const word of words) {
      const subTokenIds = this.tokenizeWord(word);
      tokenIds.push(...subTokenIds);
    }

    return tokenIds;
  }

  private basicTokenize(text: string): string[] {
    // Whitespace tokenization + punctuation splitting
    const normalized = text.toLowerCase().trim();
    if (normalized.length === 0) return [];

    const tokens: string[] = [];
    let current = '';

    for (const ch of normalized) {
      if (this.isPunctuation(ch) || this.isWhitespace(ch)) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
        if (this.isPunctuation(ch)) {
          tokens.push(ch);
        }
      } else {
        current += ch;
      }
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  private tokenizeWord(word: string): number[] {
    if (this.vocab.has(word)) {
      return [this.vocab.get(word)!];
    }

    const tokens: number[] = [];
    let start = 0;

    while (start < word.length) {
      let end = word.length;
      let found = false;

      while (start < end) {
        const substr = start === 0 ? word.slice(start, end) : `##${word.slice(start, end)}`;

        if (this.vocab.has(substr)) {
          tokens.push(this.vocab.get(substr)!);
          start = end;
          found = true;
          break;
        }
        end--;
      }

      if (!found) {
        tokens.push(this.unkId);
        start++;
      }
    }

    return tokens;
  }

  private isPunctuation(ch: string): boolean {
    const code = ch.charCodeAt(0);
    // ASCII punctuation ranges
    return (
      (code >= 33 && code <= 47) ||
      (code >= 58 && code <= 64) ||
      (code >= 91 && code <= 96) ||
      (code >= 123 && code <= 126)
    );
  }

  private isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }
}
