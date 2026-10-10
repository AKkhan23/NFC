import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    organizationSlug: z.string().min(1).max(120).optional(),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>['body'];
