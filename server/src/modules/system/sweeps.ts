import { Payment } from '../wallets/wallet.models.js';
import { VisitorPass } from '../visitors/visitor.model.js';
import { logger } from '../../config/logger.js';

export interface SweepResult {
  at: string;
  topupsCancelled: number;
  passesExpired: number;
}

/**
 * Deterministic expiry sweeps. The request-time paths already refuse expired
 * orders/passes on touch; this job flips the stored statuses so list views,
 * settlement counts, and gate verification stay truthful without a touch.
 */
export async function runSweeps(now = new Date()): Promise<SweepResult> {
  const [topups, passes] = await Promise.all([
    Payment.updateMany(
      { status: 'PENDING', expiresAt: { $lt: now } },
      { $set: { status: 'CANCELLED' } },
    ),
    VisitorPass.updateMany(
      { status: 'ACTIVE', validTo: { $lt: now } },
      { $set: { status: 'EXPIRED' } },
    ),
  ]);
  const result: SweepResult = {
    at: now.toISOString(),
    topupsCancelled: topups.modifiedCount,
    passesExpired: passes.modifiedCount,
  };
  if (result.topupsCancelled > 0 || result.passesExpired > 0) {
    logger.info(result, 'expiry sweep completed');
  }
  return result;
}

let timer: NodeJS.Timeout | undefined;

/** Boot hook: one run now, then every interval. No-op in tests. */
export function startSweeps(intervalMs = 5 * 60 * 1000): void {
  if (process.env.NODE_ENV === 'test' || process.env.SWEEP_ENABLED === 'false') return;
  if (timer) return;
  runSweeps().catch((e: unknown) => logger.warn({ e }, 'startup sweep failed'));
  timer = setInterval(() => {
    runSweeps().catch((e: unknown) => logger.warn({ e }, 'scheduled sweep failed'));
  }, intervalMs);
  timer.unref?.();
}
