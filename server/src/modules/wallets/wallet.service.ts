import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { notify } from '../notifications/notification.service.js';
import { Notification } from '../notifications/notification.model.js';
import { emitToOrg } from '../../sockets/index.js';
import { User } from '../users/user.model.js';
import { Payment, Wallet, WalletTransaction } from './wallet.models.js';
import { actorAttribution } from '../../utils/actors.js';

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

export interface MoneyOp {
  organizationId: string;
  userId: string;
  amountMinor: number;
  actorId: string;
  idempotencyKey?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  scanId?: string;
  ctx?: Ctx;
}

function key(provided?: string): string {
  return provided ?? `idem_${randomUUID()}`;
}

async function assertHolder(organizationId: string, userId: string) {
  const user = await User.findOne({ _id: userId, organizationId }).select('_id status').lean();
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  if (user.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Wallet holder is not active');
  return user;
}

async function getOrCreateWallet(organizationId: string, userId: string) {
  const existing = await Wallet.findOne({ organizationId, userId });
  if (existing) return existing;
  try {
    return await Wallet.create({ organizationId, userId, balanceMinor: 0, currency: 'INR', status: 'ACTIVE' });
  } catch {
    // Lost a create race — fetch the winner.
    const winner = await Wallet.findOne({ organizationId, userId });
    if (!winner) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not open wallet');
    return winner;
  }
}

/** Wait for a PENDING row (created by a racing request) to settle, then return it. */
async function settlePending(organizationId: string, idemKey: string) {
  for (let i = 0; i < 20; i++) {
    const row = await WalletTransaction.findOne({ organizationId, idempotencyKey: idemKey }).lean();
    if (row && row.status !== 'PENDING') return row;
    await new Promise((r) => setTimeout(r, 100));
  }
  const row = await WalletTransaction.findOne({ organizationId, idempotencyKey: idemKey }).lean();
  if (!row) throw new ApiError(500, 'INTERNAL_ERROR', 'Idempotency record vanished');
  return row;
}

export const walletService = {
  async get(auth: AuthContext, userId: string) {
    const scope = orgFilter(auth);
    await assertHolder(scope.organizationId, userId);
    const wallet = await getOrCreateWallet(scope.organizationId, userId);
    return wallet.toObject();
  },

  async setStatus(auth: AuthContext, userId: string, status: 'ACTIVE' | 'FROZEN', ctx: Ctx) {
    const scope = orgFilter(auth);
    await assertHolder(scope.organizationId, userId);
    const wallet = await getOrCreateWallet(scope.organizationId, userId);
    const previousState = { status: wallet.status };
    wallet.status = status;
    await wallet.save();
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: status === 'FROZEN' ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN',
      entityType: 'Wallet',
      entityId: String(wallet._id),
      previousState,
      newState: { status },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return wallet.toObject();
  },

  /** Core ledger writer. PENDING-first + optimistic-locked $inc = safe without replica sets. */
  async apply(op: MoneyOp & { type: 'CREDIT' | 'DEBIT' | 'REFUND' | 'ADJUSTMENT'; signedDelta: number }): Promise<{ txn: Record<string, unknown>; replay: boolean }> {
    const idemKey = key(op.idempotencyKey);
    const existing = await WalletTransaction.findOne({ organizationId: op.organizationId, idempotencyKey: idemKey }).lean();
    if (existing) {
      if (existing.status === 'PENDING') return { txn: await settlePending(op.organizationId, idemKey), replay: true };
      return { txn: existing, replay: true };
    }

    await assertHolder(op.organizationId, op.userId);
    const wallet = await getOrCreateWallet(op.organizationId, op.userId);
    if (wallet.status !== 'ACTIVE') {
      throw new ApiError(403, 'WALLET_FROZEN', `Wallet is ${wallet.status.toLowerCase()}`);
    }

    let row;
    try {
      const attribution = actorAttribution(op.actorId);
      row = await WalletTransaction.create({
        organizationId: op.organizationId,
        walletId: wallet._id,
        userId: op.userId,
        type: op.type,
        amountMinor: Math.abs(op.signedDelta),
        balanceAfterMinor: wallet.balanceMinor, // provisional; finalized below
        status: 'PENDING',
        idempotencyKey: idemKey,
        actorId: attribution.actorId,
        reason: op.reason,
        scanId: op.scanId,
        metadata: { ...(op.metadata ?? {}), ...(attribution.apiKey ? { apiKey: attribution.apiKey } : {}) },
      });
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 11000) {
        return { txn: await settlePending(op.organizationId, idemKey), replay: true };
      }
      throw e;
    }

    // Optimistic-locked balance move with overdraft guard for debits.
    const maxTries = 5;
    let moved = false;
    let balanceAfter = wallet.balanceMinor;
    for (let i = 0; i < maxTries && !moved; i++) {
      const current = await Wallet.findById(wallet._id).select('balanceMinor version status').lean();
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'Wallet not found');
      if (current.status !== 'ACTIVE') {
        await WalletTransaction.updateOne({ _id: row._id }, { $set: { status: 'FAILED' } });
        throw new ApiError(403, 'WALLET_FROZEN', 'Wallet was frozen during processing');
      }
      if (op.signedDelta < 0 && current.balanceMinor < Math.abs(op.signedDelta)) {
        await WalletTransaction.updateOne({ _id: row._id }, { $set: { status: 'FAILED' } });
        throw new ApiError(409, 'INSUFFICIENT_BALANCE', 'Insufficient wallet balance');
      }
      balanceAfter = current.balanceMinor + op.signedDelta;
      const res = await Wallet.updateOne(
        { _id: wallet._id, version: current.version },
        { $inc: { balanceMinor: op.signedDelta, version: 1 } },
      );
      moved = res.matchedCount === 1;
    }
    if (!moved) {
      await WalletTransaction.updateOne({ _id: row._id }, { $set: { status: 'FAILED' } });
      throw new ApiError(409, 'CONFLICT', 'Wallet is busy, please retry');
    }

    const done = await WalletTransaction.findByIdAndUpdate(
      row._id,
      { $set: { status: 'SUCCESS', balanceAfterMinor: balanceAfter } },
      { new: true },
    ).lean();

    await writeAudit({
      organizationId: op.organizationId,
      actorId: op.actorId,
      action: `WALLET_${op.type}`,
      entityType: 'WalletTransaction',
      entityId: String(row._id),
      newState: { type: op.type, amountMinor: Math.abs(op.signedDelta), balanceAfterMinor: balanceAfter },
      ipAddress: op.ctx?.ip,
      userAgent: op.ctx?.ua,
      requestId: op.ctx?.requestId,
    });
    emitToOrg(op.organizationId, 'wallet.tx', {
      transactionId: String(row._id),
      userId: op.userId,
      type: op.type,
      amountMinor: Math.abs(op.signedDelta),
      balanceAfterMinor: balanceAfter,
    });
    // Low-balance nudge after debits (at most one unread per day).
    if (op.type === 'DEBIT' && balanceAfter < 5000) {
      const recent = await Notification.findOne({
        organizationId: op.organizationId,
        userId: op.userId,
        type: 'LOW_BALANCE',
        readAt: { $exists: false },
        createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      })
        .select('_id')
        .lean();
      if (!recent) {
        await notify({
          organizationId: op.organizationId,
          userId: op.userId,
          type: 'LOW_BALANCE',
          title: 'Wallet balance is low',
          body: `Remaining balance is ₹${(balanceAfter / 100).toFixed(2)}. Top up to keep scanning.`,
          priority: 'MEDIUM',
        });
      }
    }
    return { txn: done ?? row.toObject(), replay: false };
  },

  async credit(op: MoneyOp) {
    const out = await this.apply({ ...op, type: 'CREDIT', signedDelta: op.amountMinor });
    if (op.metadata?.method && !out.replay) {
      const attribution = actorAttribution(op.actorId);
      await Payment.create({
        organizationId: op.organizationId,
        userId: op.userId,
        walletTransactionId: (out.txn as { _id: unknown })._id,
        amountMinor: op.amountMinor,
        method: op.metadata.method,
        status: 'SUCCESS',
        actorId: attribution.actorId,
        metadata: attribution.apiKey ? { apiKey: attribution.apiKey } : undefined,
      });
    }
    return out;
  },

  async debit(op: MoneyOp) {
    return this.apply({ ...op, type: 'DEBIT', signedDelta: -op.amountMinor });
  },

  async adjust(op: Omit<MoneyOp, 'amountMinor'> & { deltaMinor: number }) {
    return this.apply({ ...op, amountMinor: Math.abs(op.deltaMinor), type: 'ADJUSTMENT', signedDelta: op.deltaMinor });
  },

  async refund(input: { organizationId: string; originalTransactionId: string; actorId: string; idempotencyKey?: string; reason: string; ctx?: Ctx }) {
    const original = await WalletTransaction.findOne({
      _id: input.originalTransactionId,
      organizationId: input.organizationId,
    }).lean();
    if (!original) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
    if (original.type !== 'DEBIT' || original.status !== 'SUCCESS') {
      throw new ApiError(409, 'INVALID_STATE', 'Only successful debits can be refunded');
    }
    const already = await WalletTransaction.findOne({
      organizationId: input.organizationId,
      type: 'REFUND',
      status: 'SUCCESS',
      'metadata.reversalOf': String(original._id),
    })
      .select('_id')
      .lean();
    if (already) throw new ApiError(409, 'CONFLICT', 'Transaction was already refunded');
    return this.apply({
      organizationId: input.organizationId,
      userId: String(original.userId),
      amountMinor: original.amountMinor,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: { reversalOf: String(original._id) },
      type: 'REFUND',
      signedDelta: original.amountMinor,
      ctx: input.ctx,
    });
  },

  async listTransactions(
    auth: AuthContext,
    q: { page: number; pageSize: number; userId?: string; type?: string; status?: string; from?: string; to?: string },
  ) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.userId) filter.userId = q.userId;
    if (q.type) filter.type = q.type;
    if (q.status) filter.status = q.status;
    if (q.from ?? q.to) {
      filter.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
    }
    const total = await WalletTransaction.countDocuments(filter);
    const items = await WalletTransaction.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async listPayments(auth: AuthContext, q: { page: number; pageSize: number; userId?: string; status?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.userId) filter.userId = q.userId;
    if (q.status) filter.status = q.status;
    const total = await Payment.countDocuments(filter);
    const items = await Payment.find(filter).sort({ createdAt: -1 })
      .skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },
};
