import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from current directory, parent directory, or server directory
const cwd = process.cwd();
dotenv.config();
dotenv.config({ path: path.resolve(cwd, '.env') });
dotenv.config({ path: path.resolve(cwd, 'server', '.env') });
dotenv.config({ path: path.resolve(cwd, '..', '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  // Legacy single-URI (still supported — treated as the cluster URI when the
  // split vars below are empty).
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/nfc_band_management'),
  // Split configuration: set both, then pick the active one via DB_MODE
  // (or live from Settings → Database).
  MONGODB_LOCAL_URI: z.string().default(''),
  MONGODB_CLUSTER_URI: z.string().default(''),
  DB_MODE: z.enum(['local', 'cluster']).default('cluster'),
  USE_MEMORY_DB: z.coerce.boolean().default(false),
  SEED_DEMO: z.coerce.boolean().default(true),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-32-chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  NFC_BRIDGE_URL: z.string().default('http://localhost:8787'),
  NFC_READER_MODE: z.enum(['keyboard', 'pcsc', 'serial', 'network', 'vendor', 'bridge']).default('keyboard'),
  NFC_DUP_WINDOW_MS: z.coerce.number().default(3000),
  BCRYPT_ROUNDS: z.coerce.number().min(4).max(14).default(12),
  LOG_LEVEL: z.string().default('info'),
  TOPUP_WEBHOOK_SECRET: z.string().default(''),
  TOPUP_ORDER_TTL_MIN: z.coerce.number().min(5).max(1440).default(30),
  UPI_PAYEE_VPA: z.string().default(''),
  UPI_PAYEE_NAME: z.string().default('AirData'),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;
export type DbMode = 'local' | 'cluster';

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // In dev, fall back to safe defaults rather than crashing on missing secrets.
    // Production must provide real secrets (checked in app startup).
    // eslint-disable-next-line no-console
    console.warn('Invalid env, using dev defaults:', parsed.error.flatten().fieldErrors);
    const mode: DbMode = process.env.DB_MODE === 'local' ? 'local' : 'cluster';
    return {
      NODE_ENV: (process.env.NODE_ENV as Env['NODE_ENV']) ?? 'development',
      PORT: Number(process.env.PORT ?? 4000),
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/nfc_band_management',
      MONGODB_LOCAL_URI: process.env.MONGODB_LOCAL_URI ?? '',
      MONGODB_CLUSTER_URI: process.env.MONGODB_CLUSTER_URI ?? '',
      DB_MODE: mode,
      USE_MEMORY_DB: process.env.USE_MEMORY_DB === 'true',
      SEED_DEMO: process.env.SEED_DEMO !== 'false',
      JWT_SECRET: process.env.JWT_SECRET ?? 'dev-only-secret-change-me-32-chars!!',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev-only-refresh-change-me-32-chars!',
      JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
      JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '30d',
      CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',
      CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:5173',
      NFC_BRIDGE_URL: process.env.NFC_BRIDGE_URL ?? 'http://localhost:8787',
      NFC_READER_MODE: (process.env.NFC_READER_MODE as Env['NFC_READER_MODE']) ?? 'keyboard',
      NFC_DUP_WINDOW_MS: Number(process.env.NFC_DUP_WINDOW_MS ?? 3000),
      BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 12),
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
      TOPUP_WEBHOOK_SECRET: process.env.TOPUP_WEBHOOK_SECRET ?? '',
      TOPUP_ORDER_TTL_MIN: Number(process.env.TOPUP_ORDER_TTL_MIN ?? 30),
      UPI_PAYEE_VPA: process.env.UPI_PAYEE_VPA ?? '',
      UPI_PAYEE_NAME: process.env.UPI_PAYEE_NAME ?? 'AirData',
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ?? '',
      RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ?? '',
      RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    };
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';

/**
 * Resolve the two candidate URIs.
 * - Local defaults to MONGODB_LOCAL_URI, else localhost.
 * - Cluster defaults to MONGODB_CLUSTER_URI, else legacy MONGODB_URI when it
 *   looks like Atlas (mongodb+srv://), else empty (not configured).
 */
export function resolveDbUris(): { localUri: string; clusterUri: string } {
  const fallbackLocal = 'mongodb://127.0.0.1:27017/nfc_band_management';
  const localUri = env.MONGODB_LOCAL_URI.trim() || fallbackLocal;
  const clusterFromSplit = env.MONGODB_CLUSTER_URI.trim();
  const legacy = env.MONGODB_URI.trim();
  const clusterUri =
    clusterFromSplit || (legacy.startsWith('mongodb+srv://') ? legacy : '');
  return { localUri, clusterUri };
}

export function uriForMode(mode: DbMode): string {
  const { localUri, clusterUri } = resolveDbUris();
  if (mode === 'local') return localUri;
  if (!clusterUri) {
    // No Atlas URI configured — fall back to legacy MONGODB_URI so a plain
    // local-only setup keeps working.
    return env.MONGODB_URI;
  }
  return clusterUri;
}
