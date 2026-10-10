import type { NextFunction, Request, Response } from 'express';
import { attendanceService } from './attendance.service.js';

function ctx(req: Request) {
  return { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId };
}

export const attendanceController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await attendanceService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        date: req.query.date as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        userId: req.query.userId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await attendanceService.checkIn(
        req.auth!,
        {
          userId: req.body.userId,
          bandId: req.body.bandId,
          locationId: req.body.locationId,
          at: req.body.at ? new Date(req.body.at) : undefined,
          method: 'MANUAL',
        },
        ctx(req),
      );
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async checkOut(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await attendanceService.checkOut(
        req.auth!,
        {
          userId: req.body.userId,
          bandId: req.body.bandId,
          locationId: req.body.locationId,
          at: req.body.at ? new Date(req.body.at) : undefined,
          method: 'MANUAL',
        },
        ctx(req),
      );
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async manual(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await attendanceService.manual(req.auth!, req.body, ctx(req));
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async correct(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await attendanceService.correct(req.auth!, req.params.id, req.body, ctx(req));
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
