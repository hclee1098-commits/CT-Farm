// 운영 DB/Redis에 연결하지 않는 실제 Prisma + PostgreSQL 호환 DB + HTTP 검증
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { runOperationsTests } from './test-farm-operations.mts';
import {runRound2Tests} from './test-round2.mts';
import {runWorkspaceTests} from './test-workspace.mts';

const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));
const nativeUrl=process.env.FARM_TEST_DATABASE_URL;
if(nativeUrl){const url=new URL(nativeUrl);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/ct_farm_verify_[a-f0-9]{12}$/.test(url.pathname))throw new Error('격리 검증 DB만 허용합니다.');}
const db = nativeUrl?null:await PGlite.create();
const pg = db?new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 4 }):null;
await pg?.start();
Object.assign(process.env, {
  NODE_ENV: 'test', APP_ENV: 'LOCAL', DATABASE_URL: nativeUrl??`postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1`,
  WEATHER_MODE:'DISABLED', FARM_ASSISTANT_ENABLED:'false',
  REDIS_URL: 'redis://127.0.0.1:56379', LOG_LEVEL: 'fatal',
  JWT_ACCESS_SECRET: 'isolated-farm-test-secret-000000000000000000000000',
  MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4), CORS_ORIGINS: 'http://localhost:3000'
});
const { prisma } = await import('../apps/api/src/infrastructure/prisma.ts');
const { farmsRouter } = await import('../apps/api/src/modules/farms/farms.controller.ts');
const { operationsRouter, sensorIngestRouter } = await import('../apps/api/src/modules/farms/operations.controller.ts');
const {mapsRouter,plotImportRouter}=await import('../apps/api/src/modules/farms/maps.controller.ts');
const {consultationsRouter}=await import('../apps/api/src/modules/farms/consultation.controller.ts');
const {paymentsRouter}=await import('../apps/api/src/modules/farms/payment.controller.ts');
const {workspaceRouter}=await import('../apps/api/src/modules/farms/workspace.controller.ts');
const { createAccessToken } = await import('../apps/api/src/common/auth.middleware.ts');
const { globalErrorHandler } = await import('../apps/api/src/bootstrap/error-handler.ts');
const app = express(); app.use(express.json()); app.use('/farms', farmsRouter); app.use('/farms', operationsRouter);app.use('/farms',plotImportRouter);app.use('/farms',consultationsRouter);app.use('/farms',paymentsRouter);app.use('/maps',mapsRouter); app.use('/ingest',sensorIngestRouter);app.use('/workspace',workspaceRouter); app.use(globalErrorHandler);
const server = httpServer(app);
let checks = 0;
const pass = (label: string) => { checks++; console.log(`통과: ${label}`); };
try {
  if(nativeUrl){
    await prisma.user.create({data:{id:'preserved',email:'preserved@example.test',passwordHash:'fixture',name:'보존 회원'}});
    await prisma.note.create({data:{id:'preserved-note',ownerId:'preserved',title:'보존 제목',content:'보존 내용'}});
  }
  const migrations = new URL('../apps/api/prisma/migrations/', import.meta.url);
  const folders = (await readdir(migrations, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  // 기존 회원/게시글을 먼저 생성한 뒤 농장 마이그레이션을 적용합니다.
  for (const folder of folders) {
    if(!db)break;
    if (folder === '20261029070000_farm_diary') {
      await db.query('INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', ['preserved', 'preserved@example.test', 'fixture', '보존 회원']);
      await db.query('INSERT INTO "Note" (id,"ownerId",title,content,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', ['preserved-note', 'preserved', '보존 제목', '보존 내용']);
    }
    await db.exec(await readFile(new URL(folder + '/migration.sql', migrations), 'utf8'));
  }
  assert.equal((await prisma.note.findUniqueOrThrow({ where: { id: 'preserved-note' } })).content, '보존 내용'); pass('마이그레이션 후 기존 데이터 보존');
  const owner = await prisma.user.create({ data: { email: 'farmer@example.test', name: '농민', passwordHash: 'fixture' } });
  const other = await prisma.user.create({ data: { email: 'other@example.test', name: '다른 농민', passwordHash: 'fixture' } });
  const token = createAccessToken(owner.id, 0), otherToken = createAccessToken(other.id, 0);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  async function call(url: string, method = 'GET', body?: unknown, auth: string | null = token) {
    const response = await fetch(base + '/farms' + url, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() as any };
  }
  assert.equal((await call('', 'GET', undefined, null)).status, 401); pass('미인증 차단');
  const input = { name: '우리 밭', address: '경기도 테스트', latitude: 37, longitude: 127, areaM2: 1200, crop: '감자', variety: '수미', stage: 'GROWING' };
  for (const invalid of [{ ...input, ownerId: other.id }, { ...input, areaM2: -1 }, { ...input, latitude: 91 }, { ...input, stage: 'UNKNOWN' }]) assert.equal((await call('', 'POST', invalid)).status, 400);
  pass('소유자 주입·잘못된 면적·좌표·생육 단계 차단');
  const created = await call('', 'POST', input); assert.equal(created.status, 201); const id = created.body.data.id;
  assert.equal((await call('')).body.data.items.length, 1);
  assert.equal((await call('', 'GET', undefined, otherToken)).body.data.items.length, 0); pass('농장 등록·목록 및 사용자 격리');
  for (const [url, method, body] of [[`/${id}`, 'GET', undefined], [`/${id}`, 'PUT', { ...input, version: 1 }], [`/${id}`, 'DELETE', { version: 1 }], [`/${id}/diary`, 'GET', undefined], [`/${id}/diary`, 'POST', { workDate: '2026-10-29', title: '물주기', content: '관수' }]] as const) assert.equal((await call(url, method, body, otherToken)).status, 404);
  pass('타인 농장 조회·수정·보관·일지 조회·등록 차단');
  assert.equal((await call(`/${id}`, 'PUT', { ...input, name: '수정 농장', version: 1 })).status, 200);
  assert.equal((await call(`/${id}`, 'PUT', { ...input, version: 1 })).status, 409); pass('농장 수정 및 오래된 버전 충돌');
  const diary = { workDate: '2026-10-29', title: '물주기', content: '관수 20분' };
  assert.equal((await call(`/${id}/diary`, 'POST', { ...diary, workDate: '2026-02-30' })).status, 400);
  const entry = await call(`/${id}/diary`, 'POST', diary); assert.equal(entry.status, 201); const entryId = entry.body.data.id;
  assert.equal((await call(`/${id}/diary`)).body.data.items[0].workDate, diary.workDate); pass('작업일 유효성 및 영농일지 등록·조회');
  assert.equal((await call(`/${id}/diary/${entryId}`, 'PUT', { ...diary, version: 1 }, otherToken)).status, 404);
  assert.equal((await call(`/${id}/diary/${entryId}`, 'DELETE', { version: 1 }, otherToken)).status, 404);
  assert.equal((await call(`/${randomUUID()}/diary/${entryId}`, 'PUT', { ...diary, version: 1 })).status, 404); pass('타인 일지 수정·삭제 및 농장 경로 교체 차단');
  assert.equal((await call(`/${id}/diary/${entryId}`, 'PUT', { ...diary, content: '관수 30분', version: 1 })).status, 200);
  assert.equal((await call(`/${id}/diary/${entryId}`, 'DELETE', { version: 1 })).status, 409);
  assert.equal((await call(`/${id}/diary/${entryId}`, 'DELETE', { version: 2 })).status, 200);
  assert.equal((await call(`/${id}/diary`)).body.data.items.length, 0);
  assert.equal((await prisma.farmDiary.findUniqueOrThrow({ where: { id: entryId } })).content, '관수 30분'); pass('영농일지 수정·충돌·삭제 및 원본 보존');
  assert.equal((await call(`/${id}`, 'DELETE', { version: 2 })).status, 200);
  assert.equal((await call(`/${id}`)).status, 404);
  assert.equal((await call(`/${id}/diary`, 'POST', diary)).status, 404);
  assert((await prisma.farm.findUniqueOrThrow({ where: { id } })).deletedAt); pass('농장 보관 및 보관 후 일지 생성 차단');
  assert.equal(await prisma.auditEvent.count({ where: { actorId: owner.id } }), 6); pass('변경 감사 로그 저장');
  assert.equal((await call('/archived')).body.data[0].id,id);
  assert.equal((await call(`/${id}/restore`,'POST',{version:3},otherToken)).status,404);
  assert.equal((await call(`/${id}/restore`,'POST',{version:2})).status,409);
  assert.equal((await call(`/${id}/restore`,'POST',{version:3})).status,200);
  assert.equal((await call(`/${id}/diary/archived`)).body.data[0].id,entryId);
  assert.equal((await call(`/${id}/diary/${entryId}/restore`,'POST',{version:3},otherToken)).status,404);
  assert.equal((await call(`/${id}/diary/${entryId}/restore`,'POST',{version:3})).status,200);
  assert.equal((await call(`/${id}/diary`)).body.data.items.length,1);pass('농장·일지 보관 목록·버전 검사·소유자 제한 복구');
  const deviceCall=async(id:string,token:string,data:unknown)=>{
    const response=await fetch(base+'/ingest/'+id,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Device '+token},body:JSON.stringify(data)});
    return {status:response.status,body:await response.json()};
  };
  const extraFarmId=await runOperationsTests(call,deviceCall,prisma,owner.id,other.id,otherToken,pass);
  const rootCall=async(path:string,method='GET',body?:unknown,auth:string|null=token)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  await runRound2Tests(call,rootCall,prisma,extraFarmId,otherToken,deviceCall,pass);
  await runWorkspaceTests({prisma,base,owner,other,token,otherToken,pass});
  await prisma.user.update({ where: { id: owner.id }, data: { tokenVersion: 1 } });
  assert.equal((await call('')).status, 401); pass('폐기 세션 접근 차단');
  console.log(`농장 통합 검증 ${checks}개 그룹 통과. ${nativeUrl?'네이티브 PostgreSQL 격리 복원 DB':'PGlite'} 사용. 전체 Redis 미들웨어·브라우저 검증은 별도입니다.`);
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect(); await pg?.stop(); await db?.close();
}
