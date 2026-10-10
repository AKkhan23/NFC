import type { NextFunction, Request, Response } from 'express';
import { profileService } from './profile.service.js';

function ctx(req: Request) {
  return { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId };
}

export const profileController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await profileService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        search: req.query.search as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await profileService.get(req.auth!, req.params.id), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async upsert(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await profileService.upsert(req.auth!, req.body, ctx(req));
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await profileService.update(req.auth!, req.params.id, req.body, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async mine(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await profileService.getMine(req.auth!), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async upsertMine(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await profileService.upsertMine(req.auth!, req.body, ctx(req));
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async public(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await profileService.getPublic(req.params.slug), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async vcard(req: Request, res: Response, next: NextFunction) {
    try {
      const { filename, body } = await profileService.vcard(req.params.slug);
      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(body);
    } catch (e) {
      next(e);
    }
  },
};
