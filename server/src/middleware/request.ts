import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.requestId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? `req_${randomUUID()}`;
  next();
}

/** Lightweight HTTP logger (avoids pino-http interop issues under NodeNext). */
export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(
      { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start, requestId: req.requestId },
      'http',
    );
  });
  next();
}
