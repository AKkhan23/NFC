import type { NextFunction, Request, Response } from 'express';
import { bandService } from './band.service.js';

function ctx(req: Request) {
  return { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId };
}

export const bandController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await bandService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        type: req.query.type as string | undefined,
        userId: req.query.userId as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.get(req.auth!, req.params.id), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await bandService.register(req.auth!, req.body, ctx(req));
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async assign(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.assign(req.auth!, req.params.id, req.body, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async activate(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.activate(req.auth!, req.params.id, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async block(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.block(req.auth!, req.params.id, req.body.reason, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async unblock(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.unblock(req.auth!, req.params.id, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async markLost(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.markLost(req.auth!, req.params.id, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async markDamaged(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.markDamaged(req.auth!, req.params.id, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async replace(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json({ success: true, data: await bandService.replace(req.auth!, req.params.id, req.body, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await bandService.deactivate(req.auth!, req.params.id, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async rotateTapLink(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json({ success: true, data: await bandService.rotateTapLink(req.auth!, req.params.id, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
