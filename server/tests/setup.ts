// Vitest setup: fast bcrypt for tests only. Production default (12) is unchanged.
process.env.BCRYPT_ROUNDS = '4';
process.env.LOG_LEVEL = 'warn';
