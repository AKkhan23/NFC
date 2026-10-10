/** Canonical permission strings. Backend is source of truth. */
export const PERMISSIONS = [
  'users.read',
  'users.create',
  'users.update',
  'users.disable',
  'bands.read',
  'bands.create',
  'bands.update',
  'bands.assign',
  'bands.block',
  'bands.replace',
  'nfc.scan',
  'attendance.read',
  'attendance.manage',
  'access.read',
  'access.manage',
  'wallet.read',
  'wallet.manage',
  'transactions.read',
  'transactions.manage',
  'devices.read',
  'devices.manage',
  'locations.read',
  'locations.manage',
  'reports.read',
  'audit.read',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleName =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'OPERATOR'
  | 'SECURITY'
  | 'FINANCE'
  | 'VIEWER'
  | 'STUDENT';

/** Default permission sets per role. Custom roles can override via DB. */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  ADMIN: [
    'users.read', 'users.create', 'users.update', 'users.disable',
    'bands.read', 'bands.create', 'bands.update', 'bands.assign', 'bands.block', 'bands.replace',
    'nfc.scan', 'attendance.read', 'attendance.manage',
    'access.read', 'access.manage',
    'wallet.read', 'wallet.manage',
    'transactions.read', 'transactions.manage',
    'devices.read', 'devices.manage',
    'locations.read', 'locations.manage',
    'reports.read', 'audit.read', 'settings.manage',
  ],
  MANAGER: [
    'users.read', 'bands.read', 'bands.assign',
    'nfc.scan', 'attendance.read', 'attendance.manage',
    'access.read', 'access.manage',
    'devices.read', 'locations.read',
    'reports.read', 'audit.read',
  ],
  OPERATOR: ['nfc.scan', 'attendance.read', 'attendance.manage', 'bands.read'],
  SECURITY: ['nfc.scan', 'access.read', 'access.manage', 'bands.read', 'attendance.read', 'audit.read'],
  FINANCE: ['wallet.read', 'wallet.manage', 'transactions.read', 'transactions.manage', 'reports.read'],
  VIEWER: ['bands.read', 'attendance.read', 'access.read', 'transactions.read', 'reports.read'],
  /** Band holders check in via phone-tap links (no login needed), so no app permissions by default. */
  STUDENT: [],
};
