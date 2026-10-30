import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {validateManifest,signProof,verifyProof,validateServer} from './release.mjs';
const manifest={format:1,version:'a'.repeat(40),verified:true,images:Object.fromEntries(['api','web','migrate','collector'].map(k=>[k,'ghcr.io/test/app/'+k+'@sha256:'+'b'.repeat(64)]))};
test('동일 digest·STAGING 검증 증명·운영 승인 서명과 만료',()=>{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519'),bytes=Buffer.from(JSON.stringify(manifest));assert.equal(validateManifest(manifest),manifest);const proof=signProof(bytes,privateKey,'STAGING_VERIFIED');assert.ok(verifyProof(proof,bytes,publicKey,'STAGING_VERIFIED'));assert.throws(()=>verifyProof(proof,Buffer.from(JSON.stringify({...manifest,version:'c'.repeat(40)})),publicKey,'STAGING_VERIFIED'));assert.throws(()=>verifyProof(proof,bytes,publicKey,'PRODUCTION_APPROVED'));assert.throws(()=>verifyProof(proof,bytes,crypto.generateKeyPairSync('ed25519').publicKey,'STAGING_VERIFIED'));assert.throws(()=>validateManifest({...manifest,images:{...manifest.images,api:'ghcr.io/test/api:latest'}}));assert.throws(()=>verifyProof({...proof,time:new Date(Date.now()-90000000).toISOString()},bytes,publicKey,'STAGING_VERIFIED'));
});
test('서버 환경·DB 주소·비밀키 재사용 차단',()=>{
 const env={APP_ENV:'STAGING',DEPLOY_ENV:'staging',APP_ID:'secure-test',POSTGRES_DB:'secure_test_staging',POSTGRES_USER:'test',POSTGRES_PASSWORD:'a'.repeat(40),DATABASE_URL:'postgresql://test:'+('a'.repeat(40))+'@postgres:5432/secure_test_staging',SITE_DOMAIN:'staging.test.invalid',JWT_ACCESS_SECRET:'b'.repeat(40),MONITOR_WRITE_TOKEN:'c'.repeat(40),BACKUP_KEY:'d'.repeat(64),MFA_ENCRYPTION_KEY:'e'.repeat(64)};assert.equal(validateServer(env),'STAGING');assert.throws(()=>validateServer({...env,APP_ENV:'PRODUCTION'}));assert.throws(()=>validateServer({...env,DATABASE_URL:env.DATABASE_URL.replace('@postgres:','@production-db:')}));assert.throws(()=>validateServer({...env,JWT_ACCESS_SECRET:env.POSTGRES_PASSWORD}));
});
test('정적 안전 검사: 백업 선행·실패 롤백·LOCAL 배포 분리',()=>{
 const source=fs.readFileSync(new URL('./release.mjs',import.meta.url),'utf8');assert.ok(source.indexOf('await encryptedCapture')<source.indexOf("'--profile','tools'"));assert.ok(source.includes('if(stopped&&previous)'));assert.ok(source.includes('verifyProof'));const lifecycle=fs.readFileSync(new URL('../../SECURE-LIFECYCLE.ps1',import.meta.url),'utf8');assert.ok(!lifecycle.includes('release.mjs'));assert.ok(lifecycle.includes('$state.collector'));assert.ok(lifecycle.includes('Get-ProcessStamp'));assert.ok(lifecycle.includes('EndsWith($expectedCommand'));
});

// 실제 Docker 대신 실패를 주입하는 실행 파일을 사용한 배포 제어 흐름 검증입니다.
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {decryptDeploymentBackup} from './decrypt-backup.mjs';
const exec=promisify(execFile);
test('배포 제어 흐름 시뮬레이션: 암호화 백업·성공 영수증·실패 후 이전 이미지 복구',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'secure-deploy-flow-'));
 try{
 for(const sub of ['tools/deployment','tools/monitoring','bin'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
 // 시험 복사본에서만 실패 코드를 표시합니다. 실제 배포 진입점의 비밀정보 보호는 유지합니다.
 fs.writeFileSync(path.join(dir,'tools/deployment/release.mjs'),fs.readFileSync(new URL('./release.mjs',import.meta.url),'utf8').replace('main().catch(()=>{','main().catch((error)=>{console.error("TEST_FAILURE",error.message);'));fs.copyFileSync(new URL('../monitoring/core.mjs',import.meta.url),path.join(dir,'tools/monitoring/core.mjs'));
 // 자식 프로세스의 Docker 경계만 시험 어댑터로 바꿉니다. 실제 Docker에 전달될 경로는 없습니다.
 const preload=path.join(dir,'preload.mjs');fs.writeFileSync(preload,`import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {EventEmitter} from 'node:events';import {Readable} from 'node:stream';
cp.spawn=(command,args)=>{if(command!=='docker')throw Error('UNEXPECTED_TEST_COMMAND');const line=args.join(' ');fs.appendFileSync(process.env.COMMAND_LOG,line+'\\n');
const failed=line.includes('up -d --wait api')&&process.env.INJECT_FAILURE==='1'&&!fs.existsSync(process.env.FAIL_MARKER);if(failed)fs.writeFileSync(process.env.FAIL_MARKER,'fixture');
const child=new EventEmitter();child.stdout=Readable.from(line.includes('pg_dump')||line.includes('tar')?['isolated-backup-fixture']:[]);queueMicrotask(()=>child.emit('exit',failed?1:0));return child;};syncBuiltinESMExports();
globalThis.fetch=async url=>new Response('{}',{status:String(url).endsWith('/api/v1/auth/me')?401:200});`);
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const privatePath=path.join(dir,'sign.key');fs.writeFileSync(privatePath,privateKey.export({format:'pem',type:'pkcs8'}));
 const manifestPath=path.join(dir,'release.json');const bytes=Buffer.from(JSON.stringify(manifest));fs.writeFileSync(manifestPath,bytes);
 const env={...process.env,PATH:path.join(dir,'bin')+path.delimiter+process.env.PATH,APP_ENV:'STAGING',DEPLOY_ENV:'staging',APP_ID:'secure-test',POSTGRES_DB:'secure_test_staging',POSTGRES_USER:'test',POSTGRES_PASSWORD:'a'.repeat(40),DATABASE_URL:'postgresql://test:'+('a'.repeat(40))+'@postgres:5432/secure_test_staging',SITE_DOMAIN:'staging.test.invalid',JWT_ACCESS_SECRET:'b'.repeat(40),MONITOR_WRITE_TOKEN:'c'.repeat(40),BACKUP_KEY:'d'.repeat(64),MFA_ENCRYPTION_KEY:'e'.repeat(64),MONITOR_DIR:path.join(dir,'.starter-state/monitoring'),STAGING_RECEIPT_PRIVATE_KEY:privatePath,COMMAND_LOG:path.join(dir,'commands'),FAIL_MARKER:path.join(dir,'failure-marker')};
 const args=['--import',pathToFileURL(preload).href,path.join(dir,'tools/deployment/release.mjs'),'deploy',manifestPath];await exec(process.execPath,args,{env});
 const proof=JSON.parse(fs.readFileSync(manifestPath+'.staging.json'));assert.ok(verifyProof(proof,bytes,publicKey,'STAGING_VERIFIED'));
 const backupRoot=path.join(dir,'.starter-state/releases/STAGING/backups');const first=fs.readdirSync(backupRoot)[0];const encrypted=fs.readFileSync(path.join(backupRoot,first,'database.enc'));assert.equal(decryptDeploymentBackup(encrypted,Buffer.from(env.BACKUP_KEY,'hex')).toString(),'isolated-backup-fixture');const tampered=Buffer.from(encrypted);tampered[22]^=1;assert.throws(()=>decryptDeploymentBackup(tampered,Buffer.from(env.BACKUP_KEY,'hex')));
 const changed={...manifest,version:'c'.repeat(40)};fs.writeFileSync(manifestPath,JSON.stringify(changed));await assert.rejects(exec(process.execPath,args,{env:{...env,INJECT_FAILURE:'1'}}));
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'.starter-state/releases/STAGING/current.json'))).version,manifest.version);
 const events=fs.readFileSync(path.join(dir,'.starter-state/monitoring/STAGING/deployment.jsonl'),'utf8');assert.match(events,/"kind":"rollback"/);assert.match(events,/"result":"failed"/);assert.ok(!fs.existsSync(path.join(dir,'.starter-state/releases/STAGING/deploy.lock')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
