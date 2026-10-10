import type { NextFunction, Request, Response } from 'express';
import { topupService } from './topup.service.js';

function webhookSecret(req: Request): string | undefined {
  const h = req.headers['x-webhook-secret'];
  if (typeof h === 'string') return h;
  const q = req.query.secret;
  return typeof q === 'string' ? q : undefined;
}

function rawBodyOf(req: Request): Buffer {
  return (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
}

export const topupController = {
  async config(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: topupService.config(), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  async intent(req: Request, res: Response, next: NextFunction) {
    try {
      const out = await topupService.intent(req.auth!, req.params.userId, {
        amountMinor: req.body.amountMinor,
        provider: req.body.provider,
        method: req.body.method,
        idempotencyKey: req.body.idempotencyKey,
      });
      res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await topupService.get(req.auth!, req.params.orderId), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await topupService.list(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        userId: req.query.userId as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      const out = await topupService.confirm(req.auth!, req.params.orderId, req.body?.providerReference);
      res.status(out.replay ? 200 : 201).json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await topupService.cancel(req.auth!, req.params.orderId), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  /** Public gateway callback — verified by shared secret when configured. */
  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const out = await topupService.webhook({
        orderId: req.body?.orderId,
        providerOrderId: req.body?.providerOrderId,
        reference: req.body?.reference,
        status: req.body?.status,
        providerReference: req.body?.providerReference,
        secret: webhookSecret(req),
      });
      res.json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
  /** Razorpay checkout.js callback — fields HMAC, no raw body needed. */
  async razorpayCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const out = await topupService.razorpayCallback({
        providerOrderId: req.body?.razorpay_order_id ?? req.body?.providerOrderId,
        paymentId: req.body?.razorpay_payment_id ?? req.body?.paymentId,
        signature: req.body?.razorpay_signature ?? req.body?.signature,
      });
      res.json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  /** Razorpay server event — HMAC over raw bytes. */
  async razorpayEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const sig = req.headers['x-razorpay-signature'];
      const out = await topupService.razorpayEvent(rawBodyOf(req), typeof sig === 'string' ? sig : undefined);
      res.json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  /** Stripe server event — timestamped HMAC over raw bytes. */
  async stripeEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const sig = req.headers['stripe-signature'];
      const out = await topupService.stripeEvent(rawBodyOf(req), typeof sig === 'string' ? sig : undefined);
      res.json({ success: true, data: out, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
