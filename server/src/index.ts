import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env, isProd } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb } from './database/connection.js';
import { initSockets } from './sockets/index.js';
import { seedDatabase } from './seed.js';
import { startSweeps } from './modules/system/sweeps.js';
import { User } from './modules/users/user.model.js';

async function main(): Promise<void> {
  if (isProd && env.JWT_SECRET.startsWith('dev-')) {
    throw new Error('Refusing to boot in production with dev JWT_SECRET');
  }
  await connectDb();

  if (env.NODE_ENV === 'development' && env.SEED_DEMO) {
    try {
      const userCount = await User.countDocuments();
      if (userCount === 0) {
        logger.info('Database is empty: Seeding demo organization & accounts...');
        await seedDatabase(true);
        logger.info('Demo data seeded: admin@Eskills.com (Password: Test@123)');
      }
    } catch (seedErr) {
      logger.warn({ seedErr }, 'Optional demo seeding was skipped or encountered an error');
    }
  }

  const app = createApp();
  const httpServer = createServer(app);
  initSockets(httpServer);
  startSweeps();
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, mode: env.NFC_READER_MODE }, 'API listening');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});

