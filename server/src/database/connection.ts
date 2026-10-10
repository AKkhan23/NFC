import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env, uriForMode, resolveDbUris, type DbMode } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/errors.js';

let memoryServerInstance: { stop: () => Promise<boolean> } | null = null;

/** Where the Settings UI choice is persisted so restarts keep the same DB. */
function modeFilePath(): string {
  return path.resolve(process.cwd(), 'server', '.db-mode.json');
}

function altModeFilePath(): string {
  return path.resolve(process.cwd(), '.db-mode.json');
}

export interface PersistedDbChoice {
  mode?: DbMode;
  /** Custom URI override saved from Settings (e.g. pasted Atlas string). */
  customUri?: string;
  updatedAt?: string;
}

function readPersistedChoice(): PersistedDbChoice {
  for (const p of [modeFilePath(), altModeFilePath()]) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw) as PersistedDbChoice;
        if (parsed.mode === 'local' || parsed.mode === 'cluster') return parsed;
      }
    } catch {
      // ignore corrupt files — fall through to env defaults
    }
  }
  return {};
}

function writePersistedChoice(choice: PersistedDbChoice): void {
  const payload = JSON.stringify({ ...choice, updatedAt: new Date().toISOString() }, null, 2);
  try {
    fs.writeFileSync(modeFilePath(), payload, 'utf8');
  } catch {
    // e.g. cwd is server/ already — try the sibling path
    try {
      fs.writeFileSync(altModeFilePath(), payload, 'utf8');
    } catch (e) {
      logger.warn({ e }, 'Could not persist DB mode choice to disk');
    }
  }
}

export function getPersistedMode(): DbMode {
  return readPersistedChoice().mode ?? env.DB_MODE;
}

export function getPersistedCustomUri(): string | undefined {
  const u = readPersistedChoice().customUri?.trim();
  return u ? u : undefined;
}

/** The URI the server should use right now (persisted choice wins over env). */
export function getActiveUri(): string {
  const custom = getPersistedCustomUri();
  if (custom) return custom;
  return uriForMode(getPersistedMode());
}

export function redactUri(uri: string): string {
  try {
    return uri.replace(/\/\/([^@]*)@/, '//***@');
  } catch {
    return '***';
  }
}

export function parseUriInfo(uri: string): { host: string; dbName: string; srv: boolean } {
  try {
    const srv = uri.startsWith('mongodb+srv://');
    const withoutProto = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const at = withoutProto.lastIndexOf('@');
    const hostPart = (at >= 0 ? withoutProto.slice(at + 1) : withoutProto).split(/[/?]/)[0];
    const pathPart = withoutProto.split('/')[1] ?? '';
    const dbName = pathPart.split('?')[0] || 'nfc_band_management';
    return { host: hostPart || 'unknown', dbName, srv };
  } catch {
    return { host: 'unknown', dbName: 'nfc_band_management', srv: false };
  }
}

let connectedAt: Date | null = null;
let lastMode: DbMode | 'memory' | 'custom' = 'custom';

function isAtlasUri(uri: string): boolean {
  return uri.startsWith('mongodb+srv://');
}

export async function connectDb(uri?: string): Promise<void> {
  mongoose.set('strictQuery', true);

  // If a specific URI is provided (e.g. in test suites), connect directly to it
  if (uri) {
    await mongoose.connect(uri);
    connectedAt = new Date();
    lastMode = 'custom';
    logger.info({ uri: redactUri(uri) }, 'MongoDB connected');
    return;
  }

  // If USE_MEMORY_DB is explicitly set in development
  if (env.USE_MEMORY_DB && env.NODE_ENV !== 'production') {
    logger.info('USE_MEMORY_DB enabled: Starting in-memory MongoDB...');
    // Dev-only: loaded via indirection so production builds don't require the package.
    const memMod = (await Function('return import("mongodb-memory-server")')()) as {
      MongoMemoryServer: { create: () => Promise<{ stop: () => Promise<boolean>; getUri: (db: string) => string }> };
    };
    const mem = await memMod.MongoMemoryServer.create();
    memoryServerInstance = mem;
    const memUri = mem.getUri('nfc_band_management');
    await mongoose.connect(memUri);
    connectedAt = new Date();
    lastMode = 'memory';
    logger.info({ uri: memUri }, 'Connected to In-Memory MongoDB');
    return;
  }

  const persisted = readPersistedChoice();
  const mode: DbMode = persisted.mode ?? env.DB_MODE;
  const targetUri = persisted.customUri?.trim() || uriForMode(mode);

  try {
    await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: env.NODE_ENV === 'development' ? 5000 : 30000,
    });
    connectedAt = new Date();
    lastMode = persisted.customUri ? 'custom' : mode;
    logger.info(
      { uri: redactUri(targetUri), mode: lastMode, atlas: isAtlasUri(targetUri) },
      'MongoDB connected',
    );
  } catch (err: unknown) {
    if (env.NODE_ENV === 'development') {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { originalError: errMsg, mode, uri: redactUri(targetUri) },
        'Could not connect to configured database. Falling back to local in-memory MongoDB for seamless development...',
      );
      try {
        // Dev-only fallback: loaded via indirection so production builds don't require the package.
        const memMod = (await Function('return import("mongodb-memory-server")')()) as {
          MongoMemoryServer: { create: () => Promise<{ stop: () => Promise<boolean>; getUri: (db: string) => string }> };
        };
        const mem = await memMod.MongoMemoryServer.create();
        memoryServerInstance = mem;
        const memUri = mem.getUri('nfc_band_management');
        await mongoose.connect(memUri);
        connectedAt = new Date();
        lastMode = 'memory';
        logger.info({ uri: memUri }, 'Connected to In-Memory MongoDB (dev fallback)');
        return;
      } catch (memErr) {
        logger.error({ memErr }, 'Failed to start in-memory MongoDB fallback');
      }
    }
    throw err;
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
  connectedAt = null;
}

export interface DbStatus {
  mode: DbMode | 'memory' | 'custom';
  configuredMode: DbMode;
  activeUriRedacted: string;
  host: string;
  dbName: string;
  isAtlas: boolean;
  readyState: number;
  readyLabel: string;
  connectedAt: string | null;
  uptimeSec: number | null;
  localConfigured: boolean;
  clusterConfigured: boolean;
  localUriRedacted: string;
  clusterUriRedacted: string;
  useMemoryDb: boolean;
}

const READY_LABELS = ['disconnected', 'connected', 'connecting', 'disconnecting'] as const;

export function getDbStatus(): DbStatus {
  const { localUri, clusterUri } = resolveDbUris();
  const configuredMode = getPersistedMode();
  const activeUri = getActiveUri();
  const info = parseUriInfo(activeUri);
  const rs = mongoose.connection.readyState as 0 | 1 | 2 | 3;
  return {
    mode: mongoose.connection.readyState === 1 ? lastMode : lastMode,
    configuredMode,
    activeUriRedacted: redactUri(activeUri),
    host: info.host,
    dbName: mongoose.connection.name || info.dbName,
    isAtlas: info.srv,
    readyState: rs,
    readyLabel: READY_LABELS[rs] ?? String(rs),
    connectedAt: connectedAt?.toISOString() ?? null,
    uptimeSec: connectedAt ? Math.round((Date.now() - connectedAt.getTime()) / 1000) : null,
    localConfigured: Boolean(localUri),
    clusterConfigured: Boolean(clusterUri || getPersistedCustomUri()),
    localUriRedacted: redactUri(localUri),
    clusterUriRedacted: redactUri(clusterUri || getPersistedCustomUri() || ''),
    useMemoryDb: lastMode === 'memory',
  };
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  host?: string;
  dbName?: string;
  error?: string;
}

function validMongoUri(uri: string): boolean {
  return /^mongodb(\+srv)?:\/\/.+/.test(uri.trim());
}

/** Open a throwaway connection to verify a URI without touching the live one. */
export async function testConnection(uri: string, timeoutMs = 8000): Promise<TestResult> {
  const candidate = uri.trim();
  if (!validMongoUri(candidate)) {
    return { ok: false, error: 'URI must start with mongodb:// or mongodb+srv://' };
  }
  const started = Date.now();
  const conn = await mongoose.createConnection().asPromise();
  try {
    await conn.openUri(candidate, { serverSelectionTimeoutMS: timeoutMs });
    await conn.db?.admin().ping();
    const info = parseUriInfo(candidate);
    return { ok: true, latencyMs: Date.now() - started, host: info.host, dbName: info.dbName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Atlas IP-whitelist is the #1 cause — surface a helpful hint.
    const hint = /whitelist|atlas|ip/i.test(msg)
      ? ' — if this is Atlas, whitelist your IP in Atlas → Network Access.'
      : '';
    return { ok: false, error: `${msg}${hint}`.slice(0, 500) };
  } finally {
    try {
      await conn.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Switch the live mongoose connection to local/cluster (or a custom URI).
 * Tests the target first — never drops the working connection on failure.
 * Persists the choice so restarts keep it.
 */
export async function switchDatabase(
  mode: DbMode,
  customUri?: string,
): Promise<{ status: DbStatus; seeded: boolean }> {
  const { localUri, clusterUri } = resolveDbUris();
  let target = customUri?.trim() || uriForMode(mode);
  if (mode === 'cluster' && !customUri) {
    const resolved = clusterUri || getPersistedCustomUri() || '';
    if (!resolved) {
      throw new ApiError(
        400,
        'INVALID_STATE',
        'No Atlas URI configured. Set MONGODB_CLUSTER_URI in .env or paste a mongodb+srv:// URI.',
      );
    }
    target = resolved;
  }
  if (mode === 'local' && !customUri) target = localUri;
  if (!validMongoUri(target)) {
    throw new ApiError(400, 'INVALID_STATE', 'Resolved URI is not a valid MongoDB connection string.');
  }

  // 1. Verify before dropping the live connection.
  const probe = await testConnection(target);
  if (!probe.ok) {
    throw new ApiError(503, 'DB_UNREACHABLE', `Target unreachable: ${probe.error}`);
  }

  // 2. Swap connections.
  if (memoryServerInstance) {
    try {
      await memoryServerInstance.stop();
    } catch {
      // ignore
    }
    memoryServerInstance = null;
  }
  await mongoose.disconnect();
  connectedAt = null;
  await mongoose.connect(target, { serverSelectionTimeoutMS: 15000 });
  connectedAt = new Date();
  lastMode = customUri?.trim() ? 'custom' : mode;

  // 3. Persist choice.
  writePersistedChoice(customUri?.trim() ? { mode, customUri: customUri.trim() } : { mode });

  // 4. Seed empty DB so the UI never lands on a blank broken workspace.
  let seeded = false;
  if (env.SEED_DEMO) {
    try {
      const { User } = await import('../modules/users/user.model.js');
      const count = await User.countDocuments();
      if (count === 0) {
        const { seedDatabase } = await import('../seed.js');
        await seedDatabase(true);
        seeded = true;
      }
    } catch (e) {
      logger.warn({ e }, 'Post-switch auto-seed skipped');
    }
  }

  logger.info({ mode: lastMode, uri: redactUri(target), seeded }, 'Database switched at runtime');
  return { status: getDbStatus(), seeded };
}
