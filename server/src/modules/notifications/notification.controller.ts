import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../utils/errors.js';
import type { AuthContext } from '../../middleware/auth.js';
import { Notification } from './notification.model.js';

export async function listNotifications(auth: AuthContext, q: { page: number; pageSize: number; unreadOnly?: boolean; type?: string; priority?: string }) {
  const scope = { organizationId: auth.organizationId };
  const visibleTo = { $or: [{ userId: null }, { userId: new mongoose.Types.ObjectId(auth.userId) }] };
  const filter: Record<string, unknown> = { ...scope, ...visibleTo };
  if (q.unreadOnly) filter.readAt = { $exists: false };
  if (q.type) filter.type = q.type;
  if (q.priority) filter.priority = q.priority;
  const [total, unread] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...scope, ...visibleTo, readAt: { $exists: false } }),
  ]);
  const items = await Notification.find(filter).sort({ createdAt: -1 })
    .skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean();
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize), unread };
}

export async function markRead(auth: AuthContext, id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Notification not found');
  const row = await Notification.findOne({
    _id: id,
    organizationId: auth.organizationId,
    $or: [{ userId: null }, { userId: new mongoose.Types.ObjectId(auth.userId) }],
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Notification not found');
  if (!row.readAt) {
    row.readAt = new Date();
    await row.save();
  }
  return row.toObject();
}

export async function markAllRead(auth: AuthContext) {
  const res = await Notification.updateMany(
    {
      organizationId: auth.organizationId,
      readAt: { $exists: false },
      $or: [{ userId: null }, { userId: new mongoose.Types.ObjectId(auth.userId) }],
    },
    { $set: { readAt: new Date() } },
  );
  return { modified: res.modifiedCount };
}

export const notificationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listNotifications(req.auth!, {
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 20),
        unreadOnly: req.query.unreadOnly === 'true' ? true : undefined,
        type: req.query.type as string | undefined,
        priority: req.query.priority as string | undefined,
      });
      res.json({ success: true, data, requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async read(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await markRead(req.auth!, req.params.id), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },

  async readAll(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await markAllRead(req.auth!), requestId: req.requestId });
    } catch (e) {
      next(e);
    }
  },
};
