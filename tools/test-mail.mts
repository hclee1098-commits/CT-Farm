// 메일은 MemoryMailTransport이며 외부 이메일을 발송하지 않습니다.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createServer as netServer } from 'node:net';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startDockerRedis} from './isolated-redis.mjs';
async function freePort() { const server = netServer(); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const port = (server.address() as { port: number }).port; await new Promise<void>(r => server.close(() => r())); return port; }
const pgPort = await freePort(), redisPort = await freePort();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'ssv6-mail-'));
const db = await PGlite.create(); const socket = new PGLiteSocketServer({ db, port: pgPort, host: '127.0.0.1' });
let redisChild: ReturnType<typeof spawn> | undefined;
let dockerRedis: {stop:()=>Promise<void>} | undefined;
let appServer: ReturnType<typeof createServer> | undefined;
let disconnect: (() => Promise<void>) | undefined;
let closeRedis: (() => Promise<void>) | undefined;
let checks = 0; const pass = (label: string) => { checks++; console.log(`통과: ${label}`); };
try {
  await db.exec(await readFile(new URL('../apps/api/prisma/migrations/20261026153448_init/migration.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../apps/api/prisma/migrations/20261028180000_v6_security/migration.sql', import.meta.url), 'utf8'));
  await socket.start();
  if(process.env.REDIS_SERVER_BIN){
    redisChild = spawn(process.env.REDIS_SERVER_BIN, ['--bind', '127.0.0.1', '--port', String(redisPort), '--save', '', '--appendonly', 'no', '--dir', temporary], { stdio: 'ignore' });
    redisChild.on('error', () => {});
  }else dockerRedis=await startDockerRedis(redisPort);
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres?connection_limit=1`, REDIS_URL: `redis://127.0.0.1:${redisPort}`, JWT_ACCESS_SECRET: 'isolated-test-secret-000000000000000000000000000', MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4), CORS_ORIGINS: 'http://localhost:3000', LOG_LEVEL: 'fatal', UPLOAD_DIR: path.join(temporary, 'uploads') });
  const { prisma } = await import('../apps/api/src/infrastructure/prisma.ts'); disconnect = () => prisma.$disconnect();
  const cache = await import('../apps/api/src/infrastructure/redis.ts'); closeRedis = cache.closeRedis;
  const { MemoryMailTransport, configureMailTransport } = await import('../apps/api/src/modules/platform/mail.ts');
  const { app } = await import('../apps/api/src/bootstrap/app.ts');
  const mail = new MemoryMailTransport(); configureMailTransport(mail);
  await cache.connectRedis();
  appServer = createServer(app); await new Promise<void>(r => appServer!.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(appServer.address() as { port: number }).port}/api/v1`;
  async function call(route: string, body?: unknown, token?: string, method = 'POST') {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  }
  const account = { email: 'mail@example.test', name: '메일 검증', password: 'Mail-testing-password-12345' };
  const registration = await call('/auth/mobile/register', account); assert.equal(registration.status, 201); let token = registration.body.data.accessToken;
  assert.equal((await call('/account/email/request', { email: account.email, kind: 'VERIFY' })).status, 200);
  assert.equal((await call('/account/email/request', { email: 'unknown@example.test', kind: 'VERIFY' })).status, 200); assert.equal(mail.messages.length, 1); pass('Mock 메일 요청 및 계정 존재 여부 응답 통일');
  const verification = mail.messages[0]!.token;
  const action = (await db.query('SELECT "tokenHash" FROM "AccountAction"')).rows[0] as { tokenHash: string };
  assert.notEqual(action.tokenHash, verification); pass('메일 인증 토큰 해시 저장');
  assert.equal((await call('/account/email/verify', { token: verification })).status, 200);
  assert.equal((await call('/account/email/verify', { token: verification })).status, 400); pass('이메일 인증 및 토큰 1회 소비');
  assert.equal((await call('/account/email/request', { email: account.email, kind: 'RESET' })).status, 200);
  const reset = mail.messages[1]!.token;
  assert.equal((await call('/account/password/reset', { token: reset, newPassword: 'Reset-testing-password-12345' })).status, 200);
  assert.equal((await call('/auth/me', undefined, token, 'GET')).status, 401); pass('비밀번호 재설정 후 기존 세션 무효화');
  const login = await call('/auth/mobile/login', { email: account.email, password: 'Reset-testing-password-12345' }); assert.equal(login.status, 200); token = login.body.data.accessToken;
  assert.equal((await call('/account/email/change', { password: 'Reset-testing-password-12345', email: 'changed@example.test' }, token)).status, 200);
  assert.equal((await call('/account/email/change/confirm', { token: mail.messages[2]!.token })).status, 200);
  assert.equal((await call('/auth/me', undefined, token, 'GET')).status, 401); pass('새 이메일 소유 확인 후 변경 및 세션 무효화');
  const changedLogin = await call('/auth/mobile/login', { email: 'changed@example.test', password: 'Reset-testing-password-12345' }); assert.equal(changedLogin.status, 200); token = changedLogin.body.data.accessToken;
  assert.equal((await call('/account/withdraw', { password: 'Reset-testing-password-12345' }, token)).status, 200);
  assert.equal((await call('/auth/me', undefined, token, 'GET')).status, 401);
  assert.equal((await call('/account/recover', { email: 'changed@example.test', password: 'Reset-testing-password-12345' })).status, 200); pass('탈퇴 계정 접근 차단 및 30일 내 복구');
  configureMailTransport({ async send() { throw new Error('의도한 전송 실패'); } });
  assert.equal((await call('/account/email/request', { email: 'changed@example.test', kind: 'RESET' })).status, 503);
  assert.equal((await db.query('SELECT count(*) AS count FROM "AccountAction" WHERE "consumedAt" IS NULL')).rows[0]!.count, 0); pass('메일 전송 실패 시 토큰 무효화');
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await call('/auth/mobile/login', { email: 'changed@example.test', password: 'wrong-password' })).status, 401);
  assert.equal((await call('/auth/mobile/login', { email: 'changed@example.test', password: 'Reset-testing-password-12345' })).status, 401);
  assert((await db.query('SELECT "lockedUntil" FROM "User" WHERE email=$1', ['changed@example.test'])).rows[0]!.lockedUntil); pass('계정별 5회 로그인 실패 잠금');
  console.log(`Mock 메일·계정 통합 ${checks}건 통과. 실제 외부 이메일 발송은 검증하지 않았습니다.`);
} finally {
  if (appServer) { appServer.closeAllConnections(); await new Promise<void>(r => appServer!.close(() => r())); }
  if (disconnect) await disconnect(); if (closeRedis) await closeRedis();
  if (redisChild && redisChild.exitCode === null && redisChild.signalCode === null) { const exited = once(redisChild, 'exit'); redisChild.kill('SIGTERM'); await exited; }
  if (dockerRedis) await dockerRedis.stop();
  await socket.stop(); await db.close(); await rm(temporary, { recursive: true, force: true });
}
