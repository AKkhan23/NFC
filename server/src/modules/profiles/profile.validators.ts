import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug needs at least 3 characters')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase letters, numbers, dashes only');
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use E.164 format, e.g. +919876543210');
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\/[^\s/$.?#].[^\s]*$/i, 'Must be an http(s) URL');
const link = z.object({
  label: z.string().trim().min(1).max(40),
  url: httpUrl,
});

const profileBody = z.object({
  userId: objectId,
  slug: slug.optional(),
  displayName: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional(),
  phone: phone.optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  whatsapp: phone.optional(),
  website: httpUrl.optional(),
  links: z.array(link).max(12).default([]),
  photoUrl: httpUrl.optional(),
  isPublic: z.boolean().default(true),
});

export const listProfilesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(120).optional(),
  }),
});

export const getProfileSchema = z.object({
  params: z.object({ id: objectId }),
});

export const upsertProfileSchema = z.object({
  body: profileBody,
});

/** Self-service: same fields, holder is always the logged-in user. */
export const myProfileSchema = z.object({
  body: profileBody.omit({ userId: true }),
});

export const updateProfileSchema = z.object({
  params: z.object({ id: objectId }),
  body: profileBody.omit({ userId: true }).partial(),
});

export const publicProfileSchema = z.object({
  params: z.object({ slug }),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>['body'];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type MyProfileInput = z.infer<typeof myProfileSchema>['body'];
