import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { Organization } from '../organizations/organization.model.js';
import { User } from '../users/user.model.js';
import { ROLE_PERMISSIONS, type RoleName } from '../permissions/permissions.constants.js';
import { signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from './auth.tokens.js';
import { Session } from './session.model.js';

function refreshExpiry(): Date {
  // Parse '30d' style TTL crudely; default 30 days.
  const m = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_TTL);
  const n = m ? Number(m[1]) : 30;
  const unit = m?.[2] ?? 'd';
  const ms = unit === 's' ? n * 1000 : unit === 'm' ? n * 60000 : unit === 'h' ? n * 3600000 : n * 86400000;
  return new Date(Date.now() + ms);
}

function effectivePerms(role: RoleName, extra: string[]): string[] {
  const base = ROLE_PERMISSIONS[role] ?? [];
  return [...new Set([...base, ...extra])];
}

export const authService = {
  async login(input: { email: string; password: string; ip?: string; ua?: string }) {
    const user = await User.findOne({ email: input.email.toLowerCase() }).select(
      '+passwordHash organizationId email firstName lastName role permissions status',
    );
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
    if (user.status === 'DISABLED') throw new ApiError(403, 'FORBIDDEN', 'Account disabled');

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');

    const sid = createHash('sha256')
      .update(`${user._id}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 32);
    const refreshToken = signRefreshToken({ sub: String(user._id), sid });
    await Session.create({
      userId: user._id,
      refreshHash: createHash('sha256').update(refreshToken).digest('hex'),
      userAgent: input.ua,
      ipAddress: input.ip,
      expiresAt: refreshExpiry(),
    });

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const perms = effectivePerms(user.role as RoleName, user.permissions ?? []);
    const accessToken = signAccessToken({
      sub: String(user._id),
      org: String(user.organizationId),
      role: user.role,
      perms,
    });

    const org = await Organization.findById(user.organizationId).select('name slug').lean();

    return {
      accessToken,
      refreshToken,
      user: {
        id: String(user._id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: perms,
        organizationId: String(user.organizationId),
        organizationName: org?.name ?? null,
      },
    };
  },

  async refresh(refreshToken: string) {
    let payload: { sub: string; sid: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await Session.findOne({ refreshHash: hash, revokedAt: { $exists: false } });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
    const user = await User.findById(payload.sub).select(
      'organizationId email firstName lastName role permissions status',
    );
    if (!user || user.status === 'DISABLED') throw new ApiError(401, 'UNAUTHORIZED', 'Invalid session');

    const perms = effectivePerms(user.role as RoleName, user.permissions ?? []);
    const accessToken = signAccessToken({
      sub: String(user._id),
      org: String(user.organizationId),
      role: user.role,
      perms,
    });
    return { accessToken };
  },

  async logout(refreshToken: string): Promise<void> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await Session.updateOne({ refreshHash: hash }, { $set: { revokedAt: new Date() } });
  },
};
