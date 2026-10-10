import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { resolveDbUris } from '../../config/env.js';
import {
  getDbStatus,
  redactUri,
  switchDatabase,
  testConnection,
} from '../../database/connection.js';
import { writeAudit } from '../audit/audit.service.js';

export const databaseRoutes = Router();

databaseRoutes.use(requireAuth);

/** Current live connection (redacted) + which URIs are configured. */
databaseRoutes.get('/status', requirePerm('settings.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: getDbStatus(), requestId: req.requestId });
  } catch (e) {
    next(e);
  }
});

/** Which modes have a URI available (for enabling/disabling UI options). */
databaseRoutes.get('/options', requirePerm('settings.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { localUri, clusterUri } = resolveDbUris();
    res.json({
      success: true,
      data: {
        localConfigured: Boolean(localUri),
        clusterConfigured: Boolean(clusterUri),
        localUriRedacted: redactUri(localUri),
        clusterUriRedacted: clusterUri ? redactUri(clusterUri) : null,
      },
      requestId: req.requestId,
    });
  } catch (e) {
    next(e);
  }
});

const testSchema = z.object({
  body: z.object({
    mode: z.enum(['local', 'cluster']),
    uri: z.string().max(2000).optional(),
  }),
});

databaseRoutes.post(
  '/test',
  requirePerm('settings.manage'),
  validate(testSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mode, uri } = req.body as { mode: 'local' | 'cluster'; uri?: string };
      const { localUri, clusterUri } = resolveDbUris();
      const target = uri?.trim() || (mode === 'local' ? localUri : clusterUri);
      if (!target) {
        res.status(400).json({
          success: false,
          message:
            mode === 'cluster'
              ? 'No Atlas URI configured. Set MONGODB_CLUSTER_URI or paste a mongodb+srv:// URI.'
              : 'No local URI configured.',
          code: 'NOT_CONFIGURED',
          requestId: req.requestId,
        });
        return;
      }
      const result = await testConnection(target);
      res.json({ success: true, data: result, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);

const switchSchema = z.object({
  body: z.object({
    mode: z.enum(['local', 'cluster']),
    uri: z.string().max(2000).optional(),
  }),
});

databaseRoutes.post(
  '/switch',
  requirePerm('settings.manage'),
  validate(switchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mode, uri } = req.body as { mode: 'local' | 'cluster'; uri?: string };
      const before = getDbStatus();
      const { status, seeded } = await switchDatabase(mode, uri);
      await writeAudit({
        organizationId: req.auth!.organizationId,
        actorId: req.auth!.userId,
        action: 'DATABASE_SWITCHED',
        entityType: 'System',
        entityId: 'database',
        previousState: { mode: before.mode, host: before.host } as unknown as Record<string, unknown>,
        newState: { mode: status.mode, host: status.host, seeded } as unknown as Record<string, unknown>,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId,
      });
      res.json({ success: true, data: { ...status, seeded }, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
);
