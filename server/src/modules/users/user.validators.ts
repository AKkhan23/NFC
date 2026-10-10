import { z } from 'zod';

export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATOR',
  'SECURITY',
  'FINANCE',
  'VIEWER',
  'STUDENT',
] as const;

const roleEnum = z.enum(ROLES);

export const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(120).optional(),
    role: roleEnum.optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'INVITED']).optional(),
    organizationId: z.string().optional(), // SUPER_ADMIN only; ignored otherwise
  }),
});

export const getUserSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    role: roleEnum,
    permissions: z.array(z.string().max(64)).max(100).default([]),
    // SUPER_ADMIN may target another org; everyone else is pinned to their own.
    organizationId: z.string().optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      firstName: z.string().min(1).max(80).optional(),
      lastName: z.string().min(1).max(80).optional(),
      role: roleEnum.optional(),
      permissions: z.array(z.string().max(64)).max(100).optional(),
      status: z.enum(['ACTIVE', 'DISABLED', 'INVITED']).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
