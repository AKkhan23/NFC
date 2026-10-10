import type { FilterQuery } from 'mongoose';

/**
 * Enforce organization isolation server-side.
 * SUPER_ADMIN may pass explicit organizationId (query/body) to operate cross-org;
 * every other caller is pinned to req.auth.organizationId.
 * NEVER trust client-sent organizationId for non-super-admins.
 */
export function orgFilter<T>(
  auth: { organizationId: string; role: string } | undefined,
  explicitOrgId?: string,
): FilterQuery<T> & { organizationId: string } {
  if (!auth) throw new Error('orgFilter requires auth context');
  if (auth.role === 'SUPER_ADMIN' && explicitOrgId) {
    return { organizationId: explicitOrgId } as FilterQuery<T> & { organizationId: string };
  }
  return { organizationId: auth.organizationId } as FilterQuery<T> & { organizationId: string };
}

export function assertSameOrg(authOrgId: string, docOrgId: string, role: string): void {
  if (role === 'SUPER_ADMIN') return;
  if (authOrgId !== docOrgId) {
    const e = new Error('Cross-organization access denied') as Error & { status?: number; code?: string };
    e.status = 403;
    e.code = 'FORBIDDEN';
    throw e;
  }
}
