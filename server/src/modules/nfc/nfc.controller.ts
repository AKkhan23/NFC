import type { NextFunction, Request, Response } from 'express';
import { nfcScanService } from './nfcScan.service.js';

export const nfcController = {
  async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const mode = req.headers['x-nfc-adapter'] === 'bridge' ? 'bridge' : 'keyboard';
      const out = await nfcScanService.process(
        req.auth!,
        req.body,
        { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId },
        mode,
      );
      res.status(out.statusCode).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async tap(req: Request, res: Response, next: NextFunction) {
    try {
      const out = await nfcScanService.tapCheckIn(req.body.token, {
        ip: req.ip,
        ua: req.headers['user-agent'],
        requestId: req.requestId,
      });
      res.status(out.statusCode).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await nfcScanService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        nfcUid: req.query.nfcUid as string | undefined,
        action: req.query.action as string | undefined,
        result: req.query.result as string | undefined,
        deviceId: req.query.deviceId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
