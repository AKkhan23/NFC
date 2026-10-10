import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { hashPassword } from '../auth/auth.tokens.js';
import { User } from './user.model.js';
import type { CreateUserInput, UpdateUserInput } from './user.validators.js';
import { assertSubscriptionWritable, assertWithinLimit } from '../billing/subscription.js';

const PUBLIC_PROJECTION = 'organizationId email firstName lastName role permissions status lastLoginAt createdAt updatedAt';

function targetOrg(auth: AuthContext, explicit?: string): string {
  if (auth.role === 'SUPER_ADMIN' && explicit) {
    if (!mongoose.Types.ObjectId.isValid(explicit)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid organizationId');
    return explicit;
  }
  return auth.organizationId;
}

export const userService = {
  async list(
    auth: AuthContext,
    q: { page: number; pageSize: number; search?: string; role?: string; status?: string; organizationId?: string },
  ) {
    const orgId = targetOrg(auth, q.organizationId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
    }
    const total = await User.countDocuments(filter);
    const items = await User.find(filter)
      .select(PUBLIC_PROJECTION)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async get(auth: AuthContext, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    const scope = orgFilter(auth);
    const user = await User.findOne({ _id: id, ...scope }).select(PUBLIC_PROJECTION).lean();
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    return user;
  },

  async create(auth: AuthContext, input: CreateUserInput, ctx: { ip?: string; ua?: string; requestId?: string }) {
    if (input.role === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only super admins can create super admins');
    }
    const orgId = targetOrg(auth, input.organizationId);
    const exists = await User.findOne({ organizationId: orgId, email: input.email.toLowerCase() }).select('_id');
    if (exists) throw new ApiError(409, 'CONFLICT', 'Email already in use in this organization');
    await assertSubscriptionWritable(orgId);
    await assertWithinLimit(orgId, 'users');

    const user = await User.create({
      organizationId: orgId,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      permissions: input.permissions,
      status: 'ACTIVE',
    });

    await writeAudit({
      organizationId: orgId,
      actorId: auth.userId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: String(user._id),
      newState: { email: user.email, role: user.role },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });

    return user.toObject();
  },

  async update(
    auth: AuthContext,
    id: string,
    input: UpdateUserInput,
    ctx: { ip?: string; ua?: string; requestId?: string },
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    const scope = orgFilter(auth);
    const prev = await User.findOne({ _id: id, ...scope }).select(PUBLIC_PROJECTION);
    if (!prev) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    if (input.role === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only super admins can grant super admin');
    }
    if (String(prev._id) === auth.userId && input.status === 'DISABLED') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'You cannot disable your own account');
    }
    Object.assign(prev, input);
    await prev.save();

    await writeAudit({
      organizationId: String(prev.organizationId),
      actorId: auth.userId,
      action: input.status === 'DISABLED' ? 'USER_DISABLED' : 'USER_UPDATED',
      entityType: 'User',
      entityId: String(prev._id),
      previousState: { role: (prev as unknown as { role: string }).role },
      newState: input,
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });

    const out = prev.toObject() as Record<string, unknown>;
    delete out.passwordHash;
    return out;
  },
};
