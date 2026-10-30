import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { env: {
 MFA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
 NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@127.0.0.1:55432/starter_test',
 REDIS_URL: 'redis://127.0.0.1:56379', JWT_ACCESS_SECRET: 'test-only-cryptographic-key-000000000000000000000',
 CORS_ORIGINS: 'http://localhost:3000', LOG_LEVEL: 'fatal'
}, maxWorkers: 2 } });
