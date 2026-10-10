import { Router } from 'express';
import { requireAuth, requirePerm } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { walletController } from './wallet.controller.js';
import { topupController } from './topup.controller.js';
import {
  adjustSchema,
  creditSchema,
  debitSchema,
  listTransactionsSchema,
  refundSchema,
  topupConfirmSchema,
  topupIntentSchema,
  topupListSchema,
  topupOrderParamsSchema,
  topupWebhookSchema,
  walletParamsSchema,
} from './wallet.validators.js';

export const walletRoutes = Router();

/** Gateway webhook is public (HMAC/shared-secret verified) — mount before auth. */
walletRoutes.post('/topup/webhook', validate(topupWebhookSchema), topupController.webhook);
walletRoutes.post('/topup/webhook/razorpay/callback', topupController.razorpayCallback);
walletRoutes.post('/topup/webhook/razorpay', topupController.razorpayEvent);
walletRoutes.post('/topup/webhook/stripe', topupController.stripeEvent);
/** Provider availability for the UI — any authenticated user; before :orderId matching. */
walletRoutes.get('/topup/config', requireAuth, topupController.config);

walletRoutes.use(requireAuth);
walletRoutes.get('/:userId', requirePerm('wallet.read'), validate(walletParamsSchema), walletController.get);
walletRoutes.post('/:userId/credit', requirePerm('wallet.manage'), validate(creditSchema), walletController.credit);
walletRoutes.post('/:userId/debit', requirePerm('wallet.manage'), validate(debitSchema), walletController.debit);
walletRoutes.post('/:userId/adjust', requirePerm('wallet.manage'), validate(adjustSchema), walletController.adjust);
walletRoutes.post('/:userId/freeze', requirePerm('wallet.manage'), validate(walletParamsSchema), walletController.freeze);
walletRoutes.post('/:userId/unfreeze', requirePerm('wallet.manage'), validate(walletParamsSchema), walletController.unfreeze);
walletRoutes.post('/refund', requirePerm('transactions.manage'), validate(refundSchema), walletController.refund);
/** Self-service top-up: any authed holder may create an intent for their own wallet. */
walletRoutes.post('/:userId/topup/intent', validate(topupIntentSchema), topupController.intent);
walletRoutes.get('/topup/orders', validate(topupListSchema), topupController.list);
walletRoutes.get('/topup/:orderId', validate(topupOrderParamsSchema), topupController.get);
walletRoutes.post('/topup/:orderId/confirm', validate(topupConfirmSchema), topupController.confirm);
walletRoutes.post('/topup/:orderId/cancel', validate(topupOrderParamsSchema), topupController.cancel);

export const transactionRoutes = Router();

transactionRoutes.use(requireAuth);
transactionRoutes.get('/', requirePerm('transactions.read'), validate(listTransactionsSchema), walletController.transactions);
