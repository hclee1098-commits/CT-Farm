import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {allows,authorize,changeRole,editDiary,createDiary,completeTask} from './capabilities.mjs';
test('역할별 기본 거부·소유자 전용·작성자 제한',()=>{
 for(const role of ['ADMIN','WORKER','VIEWER',undefined,'PLATFORM_ADMIN'])for(const cap of ['member.manage','farm.archive','private.owner'])assert.equal(allows(role,cap),false);
 assert(allows('OWNER','member.manage'));assert(allows('ADMIN','crop.manage'));assert.equal(allows('WORKER','crop.manage'),false);
 assert(allows('WORKER','diary.update',{actorId:'a',authorId:'a'}));assert.equal(allows('WORKER','diary.update',{actorId:'a',authorId:null}),false);assert.equal(allows('VIEWER','diary.create'),false);
});
test('새 migration·기존 데이터 보존·농장 격리·해제 후 재검사·감사',async()=>{
 const db=await PGlite.create();try{
 const base=new URL('../../apps/api/prisma/migrations/',import.meta.url);for(const dir of (await fs.readdir(base,{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name).sort())await db.exec(await fs.readFile(new URL(dir+'/migration.sql',base),'utf8'));
 await db.exec(`INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ('o','o@example.test','fixture','owner',NOW()),('a','a@example.test','fixture','admin',NOW()),('w','w@example.test','fixture','worker',NOW()),('v','v@example.test','fixture','viewer',NOW());
 INSERT INTO "Farm" (id,"ownerId",name,address,latitude,longitude,"areaM2",crop,variety,"updatedAt") VALUES ('f','o','fixture','',37,127,10,'test','',NOW()),('other','v','other','',37,127,10,'test','',NOW());
 INSERT INTO "FarmDiary" (id,"farmId","workDate",title,content,"updatedAt") VALUES ('d','f','2026-10-30','fixture','preserve',NOW());
 INSERT INTO "FarmMember" (id,"farmId","userId") VALUES ('ma','f','a'),('mw','f','w'),('mv','f','v');`);
 await db.exec(await fs.readFile(new URL('./migrations/20261030020000_collaboration/migration.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('SELECT content FROM "FarmDiary" WHERE id=$1',['d'])).rows[0].content,'preserve');
 const txn=f=>db.transaction(f);
 await txn(tx=>changeRole(tx,{farmId:'f',actorId:'o',memberId:'ma',role:'ADMIN'}));await txn(tx=>changeRole(tx,{farmId:'f',actorId:'o',memberId:'mw',role:'WORKER'}));
 await assert.rejects(txn(tx=>changeRole(tx,{farmId:'f',actorId:'a',memberId:'mw',role:'ADMIN'})),/FARM_NOT_FOUND/);
 await assert.rejects(txn(tx=>authorize(tx,'other','w','diary.create')),/FARM_NOT_FOUND/);
 await assert.rejects(txn(tx=>editDiary(tx,{farmId:'f',actorId:'w',entryId:'d',content:'overwrite',version:1})),/FARM_NOT_FOUND/);
 await db.query('UPDATE "FarmDiary" SET "createdById"=$1 WHERE id=$2',['w','d']);
 await txn(tx=>editDiary(tx,{farmId:'f',actorId:'w',entryId:'d',content:'synthetic update',version:1}));
 await assert.rejects(txn(tx=>editDiary(tx,{farmId:'other',actorId:'v',entryId:'d',content:'bad',version:2})),/FARM_NOT_FOUND/);
 await txn(tx=>changeRole(tx,{farmId:'f',actorId:'o',memberId:'mw',role:null}));
 await assert.rejects(txn(tx=>authorize(tx,'f','w','diary.create')),/FARM_NOT_FOUND/);
 assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM "AuditEvent"')).rows[0].n),4);
 await txn(tx=>changeRole(tx,{farmId:'f',actorId:'o',memberId:'mw',role:'WORKER'}));
 const input={farmId:'f',actorId:'w',title:'fixture',content:'synthetic',workDate:'2026-10-30',key:'test-request-key-12345'};
 const saved=await txn(tx=>createDiary(tx,input));assert.deepEqual(await txn(tx=>createDiary(tx,input)),saved);
 assert.equal((await db.query('SELECT "createdById" FROM "FarmDiary" WHERE id=$1',[saved.id])).rows[0].createdById,'w');
 await assert.rejects(txn(tx=>createDiary(tx,{...input,content:'changed'})),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(txn(tx=>createDiary(tx,{...input,actorId:'v'})),/FARM_NOT_FOUND/);
 await db.query('INSERT INTO "FarmRecord" (id,"farmId",kind,data,"updatedAt") VALUES ($1,$2,$3,$4::jsonb,NOW())',['task','f','TASK',JSON.stringify({title:'fixture',status:'TODO',assigneeId:'w'})]);
 await txn(tx=>completeTask(tx,{farmId:'f',actorId:'w',recordId:'task',version:1}));
 assert.equal((await db.query('SELECT data FROM "FarmRecord" WHERE id=$1',['task'])).rows[0].data.status,'REPORTED');
 await assert.rejects(txn(tx=>completeTask(tx,{farmId:'f',actorId:'v',recordId:'task',version:2})),/FARM_NOT_FOUND/);
 }finally{await db.close();}
});
