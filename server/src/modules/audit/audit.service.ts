import mongoose from 'mongoose';
import { AuditLog } from './audit.model.js';

export interface AuditInput {
  organizationId: string;
  /** User ObjectId, or a service identity like `apikey:<id>` (recorded in metadata). */
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** Fire-and-forget safe: audit failures must not break business operations. */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const isUser = mongoose.Types.ObjectId.isValid(input.actorId);
    await AuditLog.create({
      ...input,
      actorId: isUser ? input.actorId : undefined,
      metadata: isUser ? undefined : { apiKey: input.actorId },
    });
  } catch {
    // Swallowed intentionally; logger attached by caller if needed.
  }
}
