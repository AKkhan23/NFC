import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject } from '../types/http.js';

export const validate =
  (schema: AnyZodObject) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({ body: req.body, query: req.query, params: req.params });
      next();
    } catch (e) {
      next(e);
    }
  };

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
