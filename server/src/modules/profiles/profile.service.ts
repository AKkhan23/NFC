import mongoose from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import { orgFilter } from '../../utils/orgScope.js';
import type { AuthContext } from '../../middleware/auth.js';
import { writeAudit } from '../audit/audit.service.js';
import { User } from '../users/user.model.js';
import { Profile } from './profile.model.js';
import { assertFeature } from '../billing/subscription.js';
import type { MyProfileInput, UpdateProfileInput, UpsertProfileInput } from './profile.validators.js';

interface Ctx {
  ip?: string;
  ua?: string;
  requestId?: string;
}

/** Only shareable contact fields ever leave the API on the public route. */
const PUBLIC_PROJECTION =
  'slug displayName title phone email whatsapp website links photoUrl views';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length >= 3 ? base : 'card';
}

async function uniqueSlug(organizationId: string, base: string, ignoreId?: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await Profile.findOne({
      organizationId,
      slug: candidate,
      ...(ignoreId ? { _id: { $ne: new mongoose.Types.ObjectId(ignoreId) } } : {}),
    })
      .select('_id')
      .lean();
    if (!clash) return candidate;
  }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Could not allocate a profile link');
}

async function assertHolder(organizationId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  const user = await User.findOne({ _id: userId, organizationId }).select('_id status').lean();
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found in this organization');
  if (user.status !== 'ACTIVE') throw new ApiError(409, 'INVALID_STATE', 'Cannot publish a profile for a non-active user');
}

function vcardEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export const profileService = {
  async list(auth: AuthContext, q: { page: number; pageSize: number; search?: string }) {
    const scope = orgFilter(auth);
    const filter: Record<string, unknown> = { ...scope };
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ displayName: rx }, { slug: rx }, { email: rx }];
    }
    const total = await Profile.countDocuments(filter);
    const items = await Profile.find(filter)
      .populate('userId', 'firstName lastName email role')
      .sort({ updatedAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean();
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  },

  async get(auth: AuthContext, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Profile not found');
    const profile = await Profile.findOne({ _id: id, ...orgFilter(auth) })
      .populate('userId', 'firstName lastName email role')
      .lean();
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'Profile not found');
    return profile;
  },

  /** One profile per user: creates on first publish, updates after. */
  async upsert(auth: AuthContext, input: UpsertProfileInput, ctx: Ctx) {
    const scope = orgFilter(auth);
    await assertFeature(scope.organizationId, 'tapProfiles');
    await assertHolder(scope.organizationId, input.userId);
    const existing = await Profile.findOne({ ...scope, userId: input.userId });
    if (existing) {
      return this.update(auth, String(existing._id), { ...input, userId: undefined } as UpdateProfileInput, ctx);
    }
    const slug = await uniqueSlug(scope.organizationId, input.slug ?? slugify(input.displayName));
    const created = await Profile.create({
      organizationId: scope.organizationId,
      userId: new mongoose.Types.ObjectId(input.userId),
      slug,
      displayName: input.displayName,
      title: input.title,
      phone: input.phone,
      email: input.email,
      whatsapp: input.whatsapp,
      website: input.website,
      links: input.links ?? [],
      photoUrl: input.photoUrl,
      isPublic: input.isPublic ?? true,
      createdBy: new mongoose.Types.ObjectId(auth.userId),
    });
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'PROFILE_CREATED',
      entityType: 'Profile',
      entityId: String(created._id),
      newState: { slug, displayName: input.displayName },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return created.toObject();
  },

  async update(auth: AuthContext, id: string, input: UpdateProfileInput, ctx: Ctx) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(404, 'NOT_FOUND', 'Profile not found');
    const scope = orgFilter(auth);
    const profile = await Profile.findOne({ _id: id, ...scope });
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'Profile not found');
    const previousSlug = profile.slug;
    if (input.slug && input.slug !== previousSlug) {
      profile.slug = await uniqueSlug(scope.organizationId, input.slug, id);
    }
    for (const [k, v] of Object.entries(input)) {
      if (k === 'slug' || v === undefined) continue;
      profile.set(k, v);
    }
    profile.set('updatedBy', new mongoose.Types.ObjectId(auth.userId));
    await profile.save();
    await writeAudit({
      organizationId: scope.organizationId,
      actorId: auth.userId,
      action: 'PROFILE_UPDATED',
      entityType: 'Profile',
      entityId: String(profile._id),
      previousState: { slug: previousSlug },
      newState: { slug: profile.slug, displayName: profile.displayName },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
      requestId: ctx.requestId,
    });
    return profile.toObject();
  },

  /** Own profile for the logged-in holder (self-service, no permission needed). */
  async getMine(auth: AuthContext) {
    const scope = orgFilter(auth);
    const profile = await Profile.findOne({ ...scope, userId: auth.userId }).lean();
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'You have no tap profile yet.');
    return profile;
  },

  /** Create or update your own profile. Holders can never touch another user. */
  async upsertMine(auth: AuthContext, input: MyProfileInput, ctx: Ctx) {
    return this.upsert(auth, { ...input, userId: auth.userId }, ctx);
  },

  /** Public page data + atomic view counter. Unpublished profiles 404 like missing ones. */
  async getPublic(slug: string) {
    const profile = await Profile.findOne({ slug: slug.toLowerCase(), isPublic: true })
      .select(PUBLIC_PROJECTION)
      .lean();
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'This profile link is invalid or unpublished.');
    await Profile.updateOne(
      { _id: profile._id },
      { $inc: { views: 1 }, $set: { lastViewedAt: new Date() } },
    ).exec();
    return { ...(profile as Record<string, unknown>), views: ((profile as { views?: number }).views ?? 0) + 1 };
  },

  /** Downloadable contact file (vCard 3.0) for "Save contact" on any phone. */
  async vcard(slug: string): Promise<{ filename: string; body: string }> {
    const profile = await Profile.findOne({ slug: slug.toLowerCase(), isPublic: true })
      .select('slug displayName title phone email website')
      .lean();
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'This profile link is invalid or unpublished.');
    const p = profile as {
      slug: string; displayName: string; title?: string; phone?: string; email?: string; website?: string;
    };
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${vcardEscape(p.displayName)}`,
      ...(p.title ? [`TITLE:${vcardEscape(p.title)}`] : []),
      ...(p.phone ? [`TEL;TYPE=CELL,VOICE:${vcardEscape(p.phone)}`] : []),
      ...(p.email ? [`EMAIL;TYPE=INTERNET:${vcardEscape(p.email)}`] : []),
      ...(p.website ? [`URL:${vcardEscape(p.website)}`] : []),
      'END:VCARD',
    ];
    return { filename: `${p.slug}.vcf`, body: `${lines.join('\r\n')}\r\n` };
  },
};
