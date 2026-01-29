import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { validateMessage } from '@aegis/common';
import { detectInjection } from './injection-detector.js';
import { logger } from '../logger/request-logger.js';

export const inputGuard = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = uuidv4();
  req.headers['x-aegis-request-id'] = requestId;

  const messageResult = validateMessage(req.body?.message);
  if (!messageResult.ok) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: messageResult.error,
      requestId,
    });
    return;
  }

  const message = messageResult.value;
  const startTime = Date.now();
  const detection = detectInjection(message);
  const latencyMs = Date.now() - startTime;

  req.headers['x-aegis-risk-score'] = String(detection.confidence);
  req.headers['x-aegis-latency-ms'] = String(latencyMs);

  if (detection.detected && (detection.riskLevel === 'critical' || detection.riskLevel === 'high')) {
    logger.warn({
      requestId,
      action: 'blocked',
      threatType: detection.type,
      riskLevel: detection.riskLevel,
      matchedPatterns: detection.matchedPatterns,
      latencyMs,
    });

    res.status(403).json({
      code: 'INJECTION_DETECTED',
      message: 'Request blocked due to security policy violation',
      requestId,
      detection: {
        type: detection.type,
        riskLevel: detection.riskLevel,
        confidence: detection.confidence,
      },
    });
    return;
  }

  if (detection.detected && detection.riskLevel === 'medium') {
    req.headers['x-aegis-warning'] = 'potential-injection';
    logger.info({
      requestId,
      action: 'warned',
      threatType: detection.type,
      riskLevel: detection.riskLevel,
      latencyMs,
    });
  }

  next();
};
