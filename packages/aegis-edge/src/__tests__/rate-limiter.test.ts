import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createRateLimiter } from '../guards/rate-limiter.js';

const createMockReq = (ip: string = '127.0.0.1'): Partial<Request> => ({
  ip,
  socket: { remoteAddress: ip } as Request['socket'],
  body: {},
});

const createMockRes = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis() as unknown as Response['status'],
    json: vi.fn().mockReturnThis() as unknown as Response['json'],
    setHeader: vi.fn() as unknown as Response['setHeader'],
  };
  return res;
};

describe('Rate Limiter', () => {
  let limiter: (req: Request, res: Response, next: NextFunction) => void;
  let next: NextFunction;

  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 1000, maxRequests: 3, blockDurationMs: 2000 });
    next = vi.fn() as unknown as NextFunction;
  });

  it('allows requests within limit', () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as Response;

    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks after maxRequests exceeded', () => {
    const req = createMockReq() as Request;

    for (let i = 0; i < 3; i++) {
      const res = createMockRes() as Response;
      limiter(req, res, next);
    }

    const res = createMockRes() as Response;
    limiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('tracks different IPs independently', () => {
    const req1 = createMockReq('1.1.1.1') as Request;
    const req2 = createMockReq('2.2.2.2') as Request;

    for (let i = 0; i < 3; i++) {
      limiter(req1, createMockRes() as Response, next);
    }

    const res1 = createMockRes() as Response;
    limiter(req1, res1, next);
    expect(res1.status).toHaveBeenCalledWith(429);

    const res2 = createMockRes() as Response;
    limiter(req2, res2, next);
    expect(next).toHaveBeenCalled();
  });
});
