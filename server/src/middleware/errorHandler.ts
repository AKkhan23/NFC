import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/errors.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? 'req_unknown';

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      requestId,
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, requestId }, 'ApiError 5xx');
    res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      requestId,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
    ...(!isProd && err instanceof Error ? { details: { stack: err.stack } } : {}),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
    requestId: req.requestId ?? 'req_unknown',
  });
}
