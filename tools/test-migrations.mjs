import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const initial = await readFile(new URL('../apps/api/prisma/migrations/20261026153448_init/migration.sql', import.meta.url), 'utf8');
const v6 = await readFile(new URL('../apps/api/prisma/migrations/20261028180000_v6_security/migration.sql', import.meta.url), 'utf8');
let passed = 0;
function pass(name) { passed++; console.log(`통과: ${name}`); }
try {
  await db.exec(initial);
  await db.query('INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', ['u1', 'migration@example.test', 'fixture-not-a-real-password', '보존 대상']);
  await db.query('INSERT INTO "Note" (id,"ownerId",title,content,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', ['n1', 'u1', '기존 제목', '기존 내용']);
  await db.exec(v6);
  const user = (await db.query('SELECT * FROM "User" WHERE id=$1', ['u1'])).rows[0];
  assert.equal(user.name, '보존 대상'); assert.equal(user.role, 'USER'); assert.equal(user.mfaEnabled, false); pass('V5 데이터 보존 및 V6 기본값');
  assert.equal((await db.query('SELECT content,version FROM "Note" WHERE id=$1', ['n1'])).rows[0].version, 1); pass('기존 게시글 보존');
  await assert.rejects(db.query('UPDATE "User" SET role=$1 WHERE id=$2', ['ROOT', 'u1'])); pass('DB 역할 CHECK 제약');
  await db.query('UPDATE "Note" SET "deletedAt"=NOW(),version=version+1 WHERE id=$1 AND "ownerId"=$2', ['n1', 'u1']);
  assert.equal((await db.query('SELECT * FROM "Note" WHERE "deletedAt" IS NULL')).rows.length, 0);
  await db.query('UPDATE "Note" SET "deletedAt"=NULL,version=version+1 WHERE id=$1 AND "ownerId"=$2', ['n1', 'u1']);
  assert.equal((await db.query('SELECT content,version FROM "Note" WHERE id=$1', ['n1'])).rows[0].content, '기존 내용'); pass('Soft Delete 및 원문 복구');
  const changed = await db.query('UPDATE "Note" SET title=$1 WHERE id=$2 AND "ownerId"=$3 RETURNING id', ['공격', 'n1', 'u2']);
  assert.equal(changed.rows.length, 0); pass('소유자 조건 불일치 시 데이터 보존');
  await assert.rejects(db.transaction(async tx => { await tx.query('UPDATE "User" SET name=$1 WHERE id=$2', ['되돌릴 값', 'u1']); throw new Error('의도한 실패'); }));
  assert.equal((await db.query('SELECT name FROM "User" WHERE id=$1', ['u1'])).rows[0].name, '보존 대상'); pass('트랜잭션 실패 롤백');
  await db.query('INSERT INTO "IdempotentRequest" (id,scope,key,"requestHash",response) VALUES ($1,$2,$3,$4,$5)', ['i1', 'notes:u1', 'request-key-00000001', 'hash', '{}']);
  await assert.rejects(db.query('INSERT INTO "IdempotentRequest" (id,scope,key,"requestHash",response) VALUES ($1,$2,$3,$4,$5)', ['i2', 'notes:u1', 'request-key-00000001', 'hash', '{}'])); pass('중복 요청 DB 유일성');
  const snapshot = await db.dumpDataDir();
  const restored = new PGlite({ loadDataDir: snapshot });
  try {
    assert.equal((await restored.query('SELECT name FROM "User" WHERE id=$1', ['u1'])).rows[0].name, '보존 대상');
    assert.equal((await restored.query('SELECT content FROM "Note" WHERE id=$1', ['n1'])).rows[0].content, '기존 내용');
    pass('WASM PostgreSQL 스냅샷 격리 복원');
  } finally { await restored.close(); }
  console.log(`SQL 검증 ${passed}건 통과. PGlite 기반이며 네이티브 PostgreSQL/Prisma/pg_restore 통합 검증을 대체하지 않습니다.`);
} finally { await db.close(); }
