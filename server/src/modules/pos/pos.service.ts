import { z } from 'zod';
import type { AuthContext } from '../../middleware/auth.js';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import { dayBounds, resolveTimezone } from '../../utils/timezone.js';
import { Organization } from '../organizations/organization.model.js';
import { WalletTransaction } from '../wallets/wallet.models.js';
import { walletService } from '../wallets/wallet.service.js';
import { assertFeature } from '../billing/subscription.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const voidSchema = z.object({
  body: z.object({
    transactionId: objectId,
    reason: z.string().min(3).max(500).default('Voided at POS counter'),
  }),
});

export const posService = {
  /**
   * One-tap void for counter mistakes. Deliberately narrow: only today's
   * successful NFC-payment debits in the caller's org. Anything else
   * (top-ups, manual debits, older days) must go through the audited
   * finance refund flow (`transactions.manage`).
   */
  async voidPayment(auth: AuthContext, transactionId: string, reason: string) {
    const scope = orgFilter(auth);
    await assertFeature(scope.organizationId, 'pos');
    const txn = await WalletTransaction.findOne({ _id: transactionId, organizationId: scope.organizationId }).lean();
    if (!txn) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
    if (txn.type !== 'DEBIT' || txn.status !== 'SUCCESS') {
      throw new ApiError(409, 'INVALID_STATE', 'Only successful charges can be voided');
    }
    if (txn.reason !== 'NFC payment') {
      throw new ApiError(403, 'FORBIDDEN', 'Only NFC counter payments can be voided here — use the finance refund flow');
    }
    const org = await Organization.findById(scope.organizationId).select('settings.timezone').lean();
    const tz = resolveTimezone((org?.settings as { timezone?: string } | undefined)?.timezone);
    const { from, to } = dayBounds(undefined, tz);
    const created = new Date((txn as { createdAt?: Date }).createdAt ?? 0);
    if (created < from || created >= to) {
      throw new ApiError(403, 'FORBIDDEN', 'Only today’s payments can be voided here — use the finance refund flow');
    }
    return walletService.refund({
      organizationId: scope.organizationId,
      originalTransactionId: transactionId,
      actorId: auth.userId,
      idempotencyKey: `posvoid_${transactionId}`,
      reason,
    });
  },
};
