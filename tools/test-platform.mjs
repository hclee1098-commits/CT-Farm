// 네이티브 Redis + 실제 Prisma/HTTP + WASM PostgreSQL. 운영 환경에는 연결하지 않습니다.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createClient } from 'redis';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {startDockerRedis} from './isolated-redis.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
async function port() { const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const result = socket.address().port; await new Promise(r => socket.close(r)); return result; }
const db = await PGlite.create();
const pgPort = await port(), redisPort = await port(), apiPort = await port();
const pg = new PGLiteSocketServer({ db, port: pgPort, host: '127.0.0.1', maxConnections: 4 });
const temporary = await mkdtemp(path.join(os.tmpdir(), 'ssv6-platform-'));
const children = []; let cache; let dockerRedis; let checks = 0;
const pass = name => { checks++; console.log(`통과: ${name}`); };
function start(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', () => {}); children.push(child); return child;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  await pg.start();
  if(process.env.REDIS_SERVER_BIN) start(process.env.REDIS_SERVER_BIN, ['--bind', '127.0.0.1', '--port', String(redisPort), '--save', '', '--appendonly', 'no', '--dir', temporary], { env: process.env });
  else dockerRedis=await startDockerRedis(redisPort);
  cache = createClient({ url: `redis://127.0.0.1:${redisPort}`, socket: { reconnectStrategy: false } }); cache.on('error', () => {});
  await delay(300); await cache.connect(); assert.equal(await cache.ping(), 'PONG'); pass('격리 네이티브 Redis 연결');
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres?connection_limit=1`, REDIS_URL: `redis://127.0.0.1:${redisPort}`, PORT: String(apiPort), JWT_ACCESS_SECRET: 'isolated-test-secret-000000000000000000000000000', MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4), CORS_ORIGINS: 'http://localhost:3000', UPLOAD_DIR: path.join(temporary, 'uploads'), LOG_LEVEL: 'fatal' };
  await exec(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(root, 'apps/api/prisma/schema.prisma')], { env, cwd: root, timeout: 60000 });
  pass('실제 Prisma migrate deploy로 신규 V5→V6 마이그레이션 적용');
  await exec(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-url', env.DATABASE_URL, '--to-schema-datamodel', path.join(root, 'apps/api/prisma/schema.prisma'), '--exit-code'], { env, cwd: root, timeout: 60000 });
  pass('마이그레이션 적용 결과와 Prisma 스키마 차이 없음');
  let api = start(process.execPath, [path.join(root, 'apps/api/dist/bootstrap/server.js')], { cwd: path.join(root, 'apps/api'), env });
  const base = `http://127.0.0.1:${apiPort}`;
  async function call(url, options = {}) { return fetch(base + url, { ...options, signal: AbortSignal.timeout(15000) }); }
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await call('/health/ready')).ok) { ready = true; break; } } catch {} if (api.exitCode !== null) break; await delay(100); }
  assert(ready, 'API 시작 실패'); pass('빌드된 API 기동 및 DB/Redis readiness');
  async function json(url, body, token, method = 'POST', extra = {}) {
    const res = await call('/api/v1' + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, data: await res.json() };
  }
  const account = { email: 'isolated@example.test', password: 'Testing-password-12345', name: '격리 테스트' };
  const created = await json('/auth/mobile/register', account); assert.equal(created.status, 201); assert(created.data.data.accessToken); pass('회원가입 및 인증 세션 DB 저장');
  let token = created.data.data.accessToken; const refresh = created.data.data.refreshToken;
  const note = await json('/notes', { title: '보존 제목', content: '보존 내용' }, token, 'POST', { 'Idempotency-Key': 'isolated-request-00001' }); assert.equal(note.status, 201);
  const repeat = await json('/notes', { title: '보존 제목', content: '보존 내용' }, token, 'POST', { 'Idempotency-Key': 'isolated-request-00001' }); assert.equal(repeat.data.data.id, note.data.data.id); pass('Idempotency-Key 중복 생성 방지');
  assert.equal((await json('/notes', { title: '다른 제목', content: '보존 내용' }, token, 'POST', { 'Idempotency-Key': 'isolated-request-00001' })).status, 409); pass('같은 키의 다른 요청 거부');
  const noteId = note.data.data.id;
  assert.equal((await json(`/notes/${noteId}`, { title: '새 제목', content: '보존 내용', version: 1 }, token, 'PUT')).status, 200);
  assert.equal((await json(`/notes/${noteId}`, { title: '덮어쓰기 시도', content: '보존 내용', version: 1 }, token, 'PUT')).status, 409); pass('낙관적 잠금으로 오래된 수정 거부');
  assert.equal((await json(`/notes/${noteId}`, undefined, token, 'DELETE')).status, 200);
  assert.equal((await json(`/notes/${noteId}`, undefined, token, 'GET')).status, 404);
  assert.equal((await json(`/notes/${noteId}/restore`, {}, token)).status, 200); pass('게시글 삭제 후 복구');
  assert.equal((await json('/admin/dashboard', undefined, token, 'GET')).status, 403); pass('일반 회원의 관리자 접근 차단');
  const image = await sharp({ create: { width: 600, height: 400, channels: 3, background: 'blue' } }).withMetadata().png().toBuffer();
  async function upload(bytes = image) {
    const form = new FormData(); form.set('file', new Blob([bytes], { type: 'image/png' }), '한글 사진.png');
    const res = await call('/api/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, data: await res.json() };
  }
  const file = await upload(); assert.equal(file.status, 201); const fileId = file.data.data.id;
  const second = await json('/auth/mobile/register', { ...account, email: 'second@example.test' }); assert.equal(second.status, 201);
  const secondToken = second.data.data.accessToken;
  assert.equal((await json(`/notes/${noteId}`, undefined, secondToken, 'GET')).status, 404);
  assert.equal((await call(`/api/v1/files/${fileId}/download`, { headers: { Authorization: `Bearer ${secondToken}` } })).status, 404); pass('다른 회원의 게시글·파일 접근 차단');
  const batch = new FormData(); batch.append('files', new Blob([image], { type: 'image/png' }), 'good.png'); batch.append('files', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'bad.png');
  const batchResponse = await call('/api/v1/files/batch', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: batch });
  assert.equal(batchResponse.status, 207); const batchBody = await batchResponse.json(); assert.deepEqual(batchBody.data.results.map(item => item.success), [true, false]); pass('다중 업로드 부분 성공·실패 구분');
  const repeatedFile = await upload(); assert.equal(repeatedFile.data.data.id, fileId); pass('실제 PNG 업로드·디코딩·중복 검사');
  const thumb = await call(`/api/v1/files/${fileId}/thumbnail`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(thumb.status, 200); assert.equal((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width, 320); pass('권한 검사 후 이미지 썸네일 생성');
  assert.equal((await upload(Buffer.from([137,80,78,71,13,10,26,10]))).status, 400); pass('가짜 PNG 업로드 거부');
  assert.equal((await json(`/files/${fileId}`, undefined, token, 'DELETE')).status, 200);
  assert.equal((await json(`/files/${fileId}`, undefined, token, 'GET')).status, 404);
  assert.equal((await json(`/files/${fileId}/restore`, {}, token)).status, 200);
  const downloaded = await call(`/api/v1/files/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(downloaded.status, 200); const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal((await sharp(downloadedBytes).metadata()).exif, undefined); pass('파일 휴지통 복구·비공개 다운로드·EXIF 제거');
  const meta = (await db.query('SELECT sha256 FROM "StoredFile" WHERE id=$1', [fileId])).rows[0];
  assert.equal(meta.sha256, crypto.createHash('sha256').update(downloadedBytes).digest('hex')); pass('실제 저장 파일 SHA-256 정합성');

  const sessions = await json('/account/sessions', undefined, token, 'GET'); assert.equal(sessions.status, 200); assert.equal(sessions.data.data.length, 1); pass('세션 목록 비밀정보 비노출');
  assert(!JSON.stringify(sessions).includes(refresh));
  const rotated = await json('/auth/mobile/refresh', { refreshToken: refresh }); assert.equal(rotated.status, 200);
  const replay = await json('/auth/mobile/refresh', { refreshToken: refresh }); assert.equal(replay.status, 401);
  assert.equal((await json('/auth/me', undefined, rotated.data.data.accessToken, 'GET')).status, 401); pass('Refresh Token 재사용 시 Access Token까지 무효화');
  assert.equal((await json('/auth/mobile/refresh', { refreshToken: rotated.data.data.refreshToken })).status, 401); pass('재사용 탐지 후 새 Refresh Token도 무효화');
  const login = await json('/auth/mobile/login', { email: account.email, password: account.password }); assert.equal(login.status, 200); token = login.data.data.accessToken;
  const oldHash = (await db.query('SELECT "passwordHash" FROM "User" WHERE email=$1', [account.email])).rows[0].passwordHash;
  assert.notEqual(oldHash, account.password); pass('실제 bcrypt 비밀번호 해시 저장');
  const changed = await json('/account/password/change', { password: account.password, newPassword: 'New-testing-password-12345' }, token); assert.equal(changed.status, 200);
  assert.equal((await json('/auth/me', undefined, token, 'GET')).status, 401); pass('비밀번호 변경 시 기존 세션 강제 무효화');
  assert.equal((await json('/auth/mobile/login', { email: account.email, password: account.password })).status, 401); pass('변경 전 비밀번호 거부');
  const relogin = await json('/auth/mobile/login', { email: account.email, password: 'New-testing-password-12345' }); assert.equal(relogin.status, 200); token = relogin.data.data.accessToken;
  const setup = await json('/account/mfa/setup', { password: 'New-testing-password-12345' }, token); assert.equal(setup.status, 200);
  function decode32(text) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, value = 0; const bytes = [];
    for (const letter of text) { value = (value << 5) | alphabet.indexOf(letter); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
    return Buffer.from(bytes);
  }
  function otp(secret, step) {
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step)); const digest = crypto.createHmac('sha1', secret).update(counter).digest();
    return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
  }
  const secret = decode32(setup.data.data.secret), step = Math.floor(Date.now() / 30000);
  const enabled = await json('/account/mfa/enable', { code: otp(secret, step) }, token); assert.equal(enabled.status, 200); assert.equal(enabled.data.data.recoveryCodes.length, 10);
  assert.equal((await json('/auth/me', undefined, token, 'GET')).status, 401); pass('MFA 등록 및 기존 세션 무효화');
  const stored = (await db.query('SELECT "mfaSecret", "recoveryHashes" FROM "User" WHERE email=$1', [account.email])).rows[0];
  assert.notEqual(stored.mfaSecret, setup.data.data.secret); assert(!stored.recoveryHashes.includes(enabled.data.data.recoveryCodes[0])); pass('MFA 비밀키 암호화 및 복구 코드 해시 저장');
  // PGlite는 한 PostgreSQL 세션을 공유하므로 별도 Prisma 프로세스의 prepared statement 이름이 충돌합니다.
  // 네이티브 PostgreSQL과 다른 테스트 어댑터 특성을 반영하여 프로세스를 순차 실행합니다.
  const apiExited = once(api, 'exit'); api.kill('SIGTERM'); await apiExited;
  await db.exec('DEALLOCATE ALL');
  await exec(process.execPath, ['--import', 'tsx', path.join(root, 'tools/bootstrap-admin.ts')], { cwd: path.join(root, 'apps/api'), env: { ...env, BOOTSTRAP_ADMIN_EMAIL: account.email }, timeout: 20000 });
  pass('최초 관리자 CLI 부트스트랩');
  await db.exec('DEALLOCATE ALL');
  api = start(process.execPath, [path.join(root, 'apps/api/dist/bootstrap/server.js')], { cwd: path.join(root, 'apps/api'), env });
  ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await call('/health/ready')).ok) { ready = true; break; } } catch {} if (api.exitCode !== null) break; await delay(100); }
  assert(ready, '관리자 지정 후 API 재시작 실패'); pass('API 정상 종료 및 재시작 후 데이터 보존');
  const adminLogin = await json('/auth/mobile/login', { email: account.email, password: 'New-testing-password-12345', mfaCode: enabled.data.data.recoveryCodes[0] }); assert.equal(adminLogin.status, 200); token = adminLogin.data.data.accessToken;
  const dashboard = await json('/admin/dashboard', undefined, token, 'GET', { 'X-MFA-Code': otp(secret, Math.floor(Date.now() / 30000) + 1) }); assert.equal(dashboard.status, 200); assert.equal(dashboard.data.data.database, 'ready'); pass('실제 MFA 관리자 로그인 및 대시보드');
  assert.equal((await json('/auth/mobile/login', { email: account.email, password: 'New-testing-password-12345', mfaCode: enabled.data.data.recoveryCodes[0] })).status, 401); pass('복구 코드 재사용 거부');
  const exported=await json('/account/export',undefined,token,'GET');assert.equal(exported.status,200);assert.ok(Array.isArray(exported.data.data.farmMemberships));assert.ok(Array.isArray(exported.data.data.farmInvitations));assert.ok(!JSON.stringify(exported.data).includes('tokenHash'));assert.ok(!JSON.stringify(exported.data).includes('passwordHash'));pass('협업 회원 내보내기와 비밀번호·초대 토큰 해시 비노출');

  console.log(`플랫폼 통합 ${checks}건 통과. WASM PostgreSQL의 단일 연결 특성상 네이티브 DB 동시성 검증은 별도 필요합니다.`);
} finally {
  for (const child of children.reverse()) {
    // SIGTERM 종료는 exitCode가 null이고 signalCode만 남습니다. 이미 종료된 자식의 exit를 다시 기다리지 않습니다.
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit').catch(() => {}); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exited; clearTimeout(timer); }
  }
  if (cache?.isOpen) await cache.quit();
  if (dockerRedis) await dockerRedis.stop();
  await pg.stop(); await db.close(); await rm(temporary, { recursive: true, force: true });
}
