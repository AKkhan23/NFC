import type { NextFunction, Request, Response } from 'express';
import { deviceService } from './device.service.js';

export const deviceController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await deviceService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        status: req.query.status as string | undefined,
        locationId: req.query.locationId as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await deviceService.register(req.auth!, req.body);
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await deviceService.update(req.auth!, req.params.id, req.body), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await deviceService.heartbeat(req.auth!, req.params.id, req.body), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await deviceService.stats(req.auth!, req.params.id), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
