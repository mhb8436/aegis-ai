import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

interface RateLimitConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly blockDurationMs: number;
}

interface ClientRecord {
  timestamps: number[];
  blockedUntil: number;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 30,
  blockDurationMs: 300000,
};

const getClientKey = (req: Request): string => {
  const sessionId = req.body?.sessionId;
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    return `session:${sessionId}`;
  }
  return `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
};

const createRedisRateLimiter = (
  cfg: RateLimitConfig,
  redisUrl: string,
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const redis = new Redis(redisUrl);

  redis.on('error', (err) => logger.error({ err }, 'Redis rate-limiter connection error'));

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientKey = getClientKey(req);
      const key = `aegis:ratelimit:${clientKey}`;
      const blockKey = `${key}:blocked`;
      const now = Date.now();
      const windowStart = now - cfg.windowMs;

      const blockedUntil = await redis.get(blockKey);
      if (blockedUntil && parseInt(blockedUntil, 10) > now) {
        const retryAfter = Math.ceil((parseInt(blockedUntil, 10) - now) / 1000);
        res.status(429).json({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfterSeconds: retryAfter,
        });
        return;
      }

      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}:${Math.random()}`);
      multi.zcard(key);
      multi.expire(key, Math.ceil(cfg.windowMs / 1000));
      const results = await multi.exec();

      const count = (results?.[2]?.[1] as number) ?? 0;

      if (count > cfg.maxRequests) {
        const blockUntil = now + cfg.blockDurationMs;
        await redis.set(blockKey, String(blockUntil), 'PX', cfg.blockDurationMs);
        res.status(429).json({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. You have been temporarily blocked.',
          retryAfterSeconds: Math.ceil(cfg.blockDurationMs / 1000),
        });
        return;
      }

      res.setHeader('X-RateLimit-Limit', String(cfg.maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, cfg.maxRequests - count)));
      next();
    } catch {
      // Redis failure: allow request through
      logger.warn('Redis rate-limiter error, allowing request');
      next();
    }
  };
};

const createInMemoryRateLimiter = (
  cfg: RateLimitConfig,
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const clients = new Map<string, ClientRecord>();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < cfg.windowMs);
      if (record.timestamps.length === 0 && record.blockedUntil < now) {
        clients.delete(key);
      }
    }
  }, cfg.windowMs);

  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getClientKey(req);
    const now = Date.now();

    let record = clients.get(key);
    if (!record) {
      record = { timestamps: [], blockedUntil: 0 };
      clients.set(key, record);
    }

    if (record.blockedUntil > now) {
      const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
      res.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    record.timestamps = record.timestamps.filter((t) => now - t < cfg.windowMs);
    record.timestamps.push(now);

    if (record.timestamps.length > cfg.maxRequests) {
      record.blockedUntil = now + cfg.blockDurationMs;
      res.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. You have been temporarily blocked.',
        retryAfterSeconds: Math.ceil(cfg.blockDurationMs / 1000),
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(cfg.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(cfg.maxRequests - record.timestamps.length));
    next();
  };
};

export const createRateLimiter = (
  config: Partial<RateLimitConfig> = {},
  redisUrl?: string | null,
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const cfg: RateLimitConfig = { ...defaultConfig, ...config };

  if (redisUrl) {
    logger.info('Using Redis-backed rate limiter');
    return createRedisRateLimiter(cfg, redisUrl);
  }

  logger.info('Using in-memory rate limiter');
  return createInMemoryRateLimiter(cfg);
};
