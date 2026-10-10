import type { NextFunction, Request, Response } from 'express';

/** Minimal cookie parser (avoids extra dep for two cookies). */
export default function cookieParser() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.cookie;
    const cookies: Record<string, string> = {};
    if (header) {
      for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      }
    }
    (req as Request & { cookies?: unknown }).cookies = cookies;
    next();
  };
}
