import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {encryptBackup,decryptBackup} from '../backup.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('합성 8MiB 파일+PGlite 스냅샷·별도 키 경로·해시/메타데이터 복구',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ctfarm-round5-recovery-'));let db,restored;const started=performance.now();
 try{
 const archive=path.join(dir,'archive'),vault=path.join(dir,'separate-key-store'),restore=path.join(dir,'isolated-restore');for(const folder of [archive,vault,restore])await fs.mkdir(folder,{mode:0o700});
 const files=[0,1].map(i=>{const b=Buffer.alloc(4*1024*1024,i+1);return {name:`synthetic-${i}.bin`,data:b.toString('base64'),sha256:hash(b)};});
 db=await PGlite.create();await db.exec('CREATE TABLE files (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, size INTEGER NOT NULL)');for(const f of files)await db.query('INSERT INTO files VALUES ($1,$2,$3)',[f.name,f.sha256,4*1024*1024]);
 const capturedAt=new Date().toISOString(),snapshot=Buffer.from(await (await db.dumpDataDir('gzip')).arrayBuffer()),key=randomBytes(32);
 const bytes=encryptBackup({version:1,project:'ctfarm-round5',database:{data:snapshot.toString('base64'),sha256:hash(snapshot)},files},key);
 await fs.writeFile(path.join(archive,'synthetic.ssbk'),bytes,{mode:0o600,flag:'wx'});await fs.writeFile(path.join(vault,'recovery.key'),key,{mode:0o600,flag:'wx'});
 await db.close();db=null;
 const restoreStarted=performance.now(),payload=decryptBackup(await fs.readFile(path.join(archive,'synthetic.ssbk')),await fs.readFile(path.join(vault,'recovery.key')));
 restored=await PGlite.create({loadDataDir:new Blob([Buffer.from(payload.database.data,'base64')])});
 for(const f of payload.files){const data=Buffer.from(f.data,'base64');await fs.writeFile(path.join(restore,f.name),data,{flag:'wx',mode:0o600});const meta=(await restored.query('SELECT * FROM files WHERE name=$1',[f.name])).rows[0];assert.equal(hash(await fs.readFile(path.join(restore,f.name))),meta.sha256);assert.equal(data.length,meta.size);}
 assert.throws(()=>decryptBackup(bytes,randomBytes(32)));const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;assert.throws(()=>decryptBackup(corrupt,key));
 console.log(JSON.stringify({database:'PGlite snapshot, NOT pg_dump/native PostgreSQL',syntheticFileBytes:8*1024*1024,filesVerified:2,capturedAt,restoreMilliseconds:performance.now()-restoreStarted,totalMilliseconds:performance.now()-started,testHarnessRssBytes:process.memoryUsage().rss,heapLimitMiB:512,offsite:false,authenticatedDownloadTested:false,productionRtoRpoMeasured:false}));
 }finally{await db?.close();await restored?.close();assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'ctfarm-round5-recovery-'));await fs.rm(dir,{recursive:true,force:true});}
});
