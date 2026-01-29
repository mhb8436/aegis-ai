import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { WordPieceTokenizer } from '../ml/tokenizer.js';

const VOCAB_PATH = path.join(__dirname, 'fixtures', 'vocab.txt');

const createTokenizer = (maxLength = 16) =>
  WordPieceTokenizer.fromVocab({ vocabPath: VOCAB_PATH, maxLength });

describe('WordPieceTokenizer', () => {
  it('loads vocab.txt and reports correct vocab size', async () => {
    const tokenizer = await createTokenizer();
    // vocab.txt has 27 non-empty lines
    expect(tokenizer.vocabSize).toBe(27);
  });

  it('tokenizes known English words', async () => {
    const tokenizer = await createTokenizer();
    const result = tokenizer.tokenize('hello world');

    // inputIds[0] should be [CLS] = 2, last real token should be [SEP] = 3
    expect(result.inputIds[0]).toBe(2n); // [CLS]
    expect(result.inputIds[1]).toBe(5n); // hello
    expect(result.inputIds[2]).toBe(6n); // world
    expect(result.inputIds[3]).toBe(3n); // [SEP]
  });

  it('produces [UNK] tokens for unknown words', async () => {
    const tokenizer = await createTokenizer();
    const result = tokenizer.tokenize('xyz');

    // 'xyz' is not in vocab → each character → [UNK] (id=1)
    // [CLS] [UNK] [UNK] [UNK] [SEP]
    expect(result.inputIds[0]).toBe(2n); // [CLS]
    // The unknown characters should map to UNK id
    expect(result.inputIds[1]).toBe(1n); // [UNK]
    expect(result.inputIds[result.inputIds.indexOf(3n) - 0]).toBeDefined();
  });

  it('adds [CLS] and [SEP] tokens', async () => {
    const tokenizer = await createTokenizer();
    const result = tokenizer.tokenize('test');

    expect(result.inputIds[0]).toBe(2n); // [CLS]
    // Find [SEP] after content tokens
    const ids = Array.from(result.inputIds);
    expect(ids).toContain(3n); // [SEP]
  });

  it('pads output to maxLength', async () => {
    const tokenizer = await createTokenizer(32);
    const result = tokenizer.tokenize('hello');

    expect(result.inputIds.length).toBe(32);
    expect(result.attentionMask.length).toBe(32);
    expect(result.tokenTypeIds.length).toBe(32);

    // After [CLS] hello [SEP], rest should be [PAD] with attention_mask=0
    expect(result.attentionMask[0]).toBe(1n);
    expect(result.attentionMask[1]).toBe(1n);
    expect(result.attentionMask[2]).toBe(1n); // [SEP]
    expect(result.attentionMask[3]).toBe(0n); // padding
  });

  it('truncates to maxLength - 2 (for CLS and SEP)', async () => {
    const tokenizer = await createTokenizer(4);
    // maxLength=4 means max 2 content tokens
    const result = tokenizer.tokenize('hello world the test');

    expect(result.inputIds.length).toBe(4);
    expect(result.inputIds[0]).toBe(2n); // [CLS]
    expect(result.inputIds[3]).toBe(3n); // [SEP]
    // Only 2 content tokens fit: hello, world
    expect(result.inputIds[1]).toBe(5n); // hello
    expect(result.inputIds[2]).toBe(6n); // world
  });

  it('handles empty text', async () => {
    const tokenizer = await createTokenizer(8);
    const result = tokenizer.tokenize('');

    expect(result.inputIds[0]).toBe(2n); // [CLS]
    expect(result.inputIds[1]).toBe(3n); // [SEP]
    expect(result.attentionMask[0]).toBe(1n);
    expect(result.attentionMask[1]).toBe(1n);
    expect(result.attentionMask[2]).toBe(0n); // rest is padding
  });

  it('splits punctuation into separate tokens', async () => {
    const tokenizer = await createTokenizer();
    const result = tokenizer.tokenize('hello, world!');

    // Should produce: [CLS] hello , world ! [SEP]
    expect(result.inputIds[0]).toBe(2n);  // [CLS]
    expect(result.inputIds[1]).toBe(5n);  // hello
    expect(result.inputIds[2]).toBe(23n); // ,
    expect(result.inputIds[3]).toBe(6n);  // world
    expect(result.inputIds[4]).toBe(25n); // !
    expect(result.inputIds[5]).toBe(3n);  // [SEP]
  });

  it('lowercases input text', async () => {
    const tokenizer = await createTokenizer();
    const result = tokenizer.tokenize('Hello WORLD');

    // After lowercasing: hello world
    expect(result.inputIds[1]).toBe(5n); // hello
    expect(result.inputIds[2]).toBe(6n); // world
  });

  it('sets tokenTypeIds to all zeros', async () => {
    const tokenizer = await createTokenizer();
    const result = tokenizer.tokenize('hello');

    for (let i = 0; i < result.tokenTypeIds.length; i++) {
      expect(result.tokenTypeIds[i]).toBe(0n);
    }
  });
});
