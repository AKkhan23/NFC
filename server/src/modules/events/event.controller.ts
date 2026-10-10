import type { NextFunction, Request, Response } from 'express';
import { eventService } from './event.service.js';

function ctx(req: Request) {
  return { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId };
}

export const eventController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await eventService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        status: req.query.status as string | undefined,
        upcoming: req.query.upcoming === 'true' ? true : undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await eventService.create(req.auth!, req.body, ctx(req));
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await eventService.update(req.auth!, req.params.id, req.body, ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await eventService.checkIn(req.auth!, req.params.id, req.body.userId, { ctx: ctx(req) });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
