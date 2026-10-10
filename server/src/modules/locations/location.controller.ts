import type { NextFunction, Request, Response } from 'express';
import { locationService } from './location.service.js';

export const locationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await locationService.listLocations(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 50),
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await locationService.createLocation(req.auth!, req.body, { requestId: req.requestId });
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await locationService.updateLocation(req.auth!, req.params.id, req.body, { requestId: req.requestId });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async tree(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await locationService.tree(req.auth!), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async createZone(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await locationService.createZone(req.auth!, req.body);
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async createGate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await locationService.createGate(req.auth!, req.body);
      res.status(201).json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async updateGate(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await locationService.updateGate(req.auth!, req.params.id, req.body), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
