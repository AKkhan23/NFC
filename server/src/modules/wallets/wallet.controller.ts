import type { NextFunction, Request, Response } from 'express';
import { walletService } from './wallet.service.js';

function ctx(req: Request) {
  return { ip: req.ip, ua: req.headers['user-agent'], requestId: req.requestId };
}

export const walletController = {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await walletService.get(req.auth!, req.params.userId), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async credit(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = req.auth!;
      const out = await walletService.credit({
        organizationId: scope.organizationId,
        userId: req.params.userId,
        amountMinor: req.body.amountMinor,
        actorId: scope.userId,
        idempotencyKey: req.body.idempotencyKey,
        reason: req.body.reason,
        metadata: req.body.method ? { method: req.body.method } : undefined,
        ctx: ctx(req),
      });
      res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async debit(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = req.auth!;
      const out = await walletService.debit({
        organizationId: scope.organizationId,
        userId: req.params.userId,
        amountMinor: req.body.amountMinor,
        actorId: scope.userId,
        idempotencyKey: req.body.idempotencyKey,
        reason: req.body.reason,
        ctx: ctx(req),
      });
      res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async adjust(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = req.auth!;
      const out = await walletService.adjust({
        organizationId: scope.organizationId,
        userId: req.params.userId,
        deltaMinor: req.body.deltaMinor,
        actorId: scope.userId,
        idempotencyKey: req.body.idempotencyKey,
        reason: req.body.reason,
        ctx: ctx(req),
      });
      res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async refund(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = req.auth!;
      const out = await walletService.refund({
        organizationId: scope.organizationId,
        originalTransactionId: req.body.transactionId,
        actorId: scope.userId,
        idempotencyKey: req.body.idempotencyKey,
        reason: req.body.reason,
        ctx: ctx(req),
      });
      res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async freeze(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await walletService.setStatus(req.auth!, req.params.userId, 'FROZEN', ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async unfreeze(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await walletService.setStatus(req.auth!, req.params.userId, 'ACTIVE', ctx(req)), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async transactions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await walletService.listTransactions(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        userId: req.query.userId as string | undefined,
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
