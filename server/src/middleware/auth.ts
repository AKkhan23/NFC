import type { NextFunction, Request, Response } from 'express';
import { unauthorized, forbidden } from '../utils/errors.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import { authFromApiKey } from '../modules/billing/apiKeys.js';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  // httpOnly cookie fallback (set by login when available)
  const cookies = req.headers.cookie ?? '';
  const m = cookies.match(/(?:^|;\s*)accessToken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Requires a valid JWT (or org API key via X-Api-Key). Never trust client-sent org/role — always derive from token. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'];
  try {
    // Service identity for integrators (plan-gated at key creation). A user
    // session, when present, always wins over the header.
    if (typeof apiKey === 'string' && apiKey && !bearerToken(req)) {
      const keyAuth = await authFromApiKey(apiKey);
      if (!keyAuth) {
        next(unauthorized('Invalid API key'));
        return;
      }
      req.auth = keyAuth;
      next();
      return;
    }
    const token = bearerToken(req);
    if (!token) {
      next(unauthorized('Missing access token'));
      return;
    }
    const p = verifyAccessToken(token);
    req.auth = {
      userId: p.sub,
      organizationId: p.org,
      role: p.role,
      permissions: p.perms,
    };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

/** Requires one of the given permissions (backend-enforced; frontend hiding is not enough). */
export function requirePerm(...perms: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(unauthorized());
      return;
    }
    if (auth.role === 'SUPER_ADMIN') {
      next();
      return;
    }
    const ok = perms.some((p) => auth.permissions.includes(p));
    if (!ok) {
      next(forbidden(`Missing permission: ${perms.join(' or ')}`));
      return;
    }
    next();
  };
}

/** SUPER_ADMIN-only guard (cross-organization operations). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'SUPER_ADMIN') {
    next(forbidden('Super admin only'));
    return;
  }
  next();
}
