import { v4 as uuidv4 } from 'uuid';
import type {
  RAGIngestRequest,
  RAGIngestResult,
  RAGChunkValidateRequest,
  RAGChunkValidateResult,
} from '@aegis/common';
import { scanDocument } from '../guards/rag-guard.js';

export const scanIngestDocuments = (request: RAGIngestRequest): RAGIngestResult => {
  const requestId = uuidv4();
  let totalBlocked = 0;

  const results = request.documents.map((doc, index) => {
    const scanResult = scanDocument({
      content: doc.content,
      source: doc.source,
      metadata: doc.metadata,
    });

    if (!scanResult.isSafe) {
      totalBlocked++;
    }

    return {
      index,
      isSafe: scanResult.isSafe,
      riskScore: scanResult.riskScore,
      findings: scanResult.findings.map((f) => ({
        type: f.type,
        description: f.description,
        severity: f.severity,
      })),
    };
  });

  return {
    requestId,
    results,
    totalScanned: request.documents.length,
    totalBlocked,
  };
};

export const validateChunks = (request: RAGChunkValidateRequest): RAGChunkValidateResult => {
  const requestId = uuidv4();

  const results = request.chunks.map((chunk) => {
    const scanResult = scanDocument({
      content: chunk.content,
      source: chunk.source,
    });

    return {
      chunkId: chunk.chunkId,
      isSafe: scanResult.isSafe,
      riskScore: scanResult.riskScore,
    };
  });

  return {
    requestId,
    results,
  };
};
