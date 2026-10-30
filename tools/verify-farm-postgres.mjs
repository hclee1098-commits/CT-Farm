// 기존 DB는 먼저 암호화 백업하고, 별도 DB에 복원해 추가 마이그레이션을 검증합니다.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { encryptBackup, decryptBackup } from './backup.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawExec = promisify(execFile);
const exec = async (...args) => {
  try { return await rawExec(...args); }
  catch (e) {
    if(args[1]?.some?.(v=>String(v).endsWith('verify-restored-files.mts'))){
      const safe=String(e.stderr||'').replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi,'[주소 생략]').replace(/[A-Za-z0-9_@.+-]{32,}/g,'[긴 값 생략]');console.error(safe.slice(-2000));
    }
    throw new Error('DB 검증 하위 명령이 실패했습니다. 연결 문자열과 비밀키는 출력하지 않습니다.');
  }
};
const environment = { ...dotenv.parse(await fs.readFile(path.join(root, '.env'))), ...dotenv.parse(await fs.readFile(path.join(root, 'apps/api/.env'))), ...process.env };
const project = environment.COMPOSE_PROJECT_NAME;
if (!/^[a-z][a-z0-9_-]{2,63}$/.test(project ?? '')) throw new Error('프로젝트 식별자 확인 필요');
const sourceUrl = new URL(environment.DATABASE_URL);
const includeUploads=process.argv.includes('--include-uploads');
const drillStarted=Date.now();let capturedFiles=[];let recoveryDirectory;
if(includeUploads){
 const identity=JSON.parse(await fs.readFile(path.join(root,'.starter-state/identity.json'),'utf8'));
 if(identity.Project!==project)throw Error('백업 프로젝트 식별자 불일치');
 // 전용 로컬 점검 구간만 허용합니다. 접근 거부·시간 초과는 중지 증거로 인정하지 않습니다.
 try{await fetch(`http://127.0.0.1:${identity.ApiPort}/health/live`,{signal:AbortSignal.timeout(2000)});throw Error('쓰기 API를 먼저 STOP해야 합니다.');}
 catch(e){if(e.cause?.code!=='ECONNREFUSED')throw Error('API 중지 증거 없음: DB+파일 백업 중단');}
 const uploads=path.resolve(root,'apps/api',environment.UPLOAD_DIR||'uploads');
 const stat=await fs.lstat(uploads);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('업로드 루트 링크 거부');
 let size=0;
 for(const name of await fs.readdir(uploads)){
  if(name.startsWith('.'))continue;
  const target=path.join(uploads,name),s=await fs.lstat(target);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink>1)throw Error('업로드 일반 파일만 허용');
  size+=s.size;if(size>100*1024*1024)throw Error('이번 복구 훈련 한도 100MB 초과');
  const bytes=await fs.readFile(target);capturedFiles.push({name,data:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')});
 }
}
if (!['localhost', '127.0.0.1'].includes(sourceUrl.hostname)) throw new Error('로컬 DB만 검증합니다.');
const database = 'ct_farm_verify_' + randomBytes(6).toString('hex');
const args = ['compose', 'exec', '-T', 'postgres'];
async function docker(tail, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...args, ...tail], { cwd: root, env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const output = [], errors = [];
    child.stdout.on('data', b => output.push(b)); child.stderr.on('data', b => errors.push(b));
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(`Docker DB 검사 실패 (${code}); 비밀정보 보호를 위해 원문은 출력하지 않습니다.`)));
    child.stdin.end(input);
  });
}
const stamp = Date.now();
const dump = await docker(['sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges']);
await fs.mkdir(path.join(root, '.starter-state'), { recursive: true });
const keyPath = path.join(root, '.starter-state/ct-farm-backup.key');
let key;
try { key = await fs.readFile(keyPath); } catch (e) {
  if (e.code !== 'ENOENT') throw e;
  key = randomBytes(32); await fs.writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
}
if (key.length !== 32) throw new Error('백업 키 형식 오류');
const encrypted = encryptBackup({ version: 1, project, createdAt: new Date().toISOString(), database: { name: 'database.dump', data: dump.toString('base64'), sha256: createHash('sha256').update(dump).digest('hex') }, files: capturedFiles }, key);
const backup = path.join(root, `backup/ct-farm-postgres-${stamp}.ssbk`);
await fs.writeFile(backup, encrypted, { flag: 'wx', mode: 0o600 });
const restoredPayload=decryptBackup(await fs.readFile(backup),key);
const restoredDump = Buffer.from(restoredPayload.database.data, 'base64');
if(includeUploads){
 recoveryDirectory=path.join(root,'verification/runtime','restore-'+database);
 await fs.mkdir(recoveryDirectory,{recursive:true,mode:0o700});
 for(const file of restoredPayload.files){
  const target=path.join(recoveryDirectory,file.name);await fs.writeFile(target,Buffer.from(file.data,'base64'),{flag:'wx',mode:0o600});
  if(createHash('sha256').update(await fs.readFile(target)).digest('hex')!==file.sha256)throw Error('복원 파일 해시 불일치');
 }
}
await docker(['sh', '-c', 'createdb -U "$POSTGRES_USER" "$1"', 'ct-farm', database]);
await docker(['sh', '-c', 'pg_restore -U "$POSTGRES_USER" -d "$1" --single-transaction --exit-on-error --no-owner --no-privileges', 'ct-farm', database], restoredDump);
const isolatedUrl = new URL(sourceUrl); isolatedUrl.pathname = '/' + database;
const prisma = path.join(root, 'node_modules/prisma/build/index.js');
const schema = path.join(root, 'apps/api/prisma/schema.prisma');
const childEnv = { ...environment, DATABASE_URL: isolatedUrl.toString() };
// 기존 열 집합을 고정합니다. nullable 열 추가로 JSON 모양이 바뀌어도 기존 값은 동일하게 비교합니다.
const schemaQuery=`SELECT COALESCE(jsonb_object_agg(table_name,cols),'{}'::jsonb) FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) AS cols FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' GROUP BY table_name) s;`;
const columnManifest=JSON.parse((await docker(['sh','-c','psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','ct-farm',database],schemaQuery)).toString());
const frozenColumns=JSON.stringify(columnManifest).replaceAll("'","''");
const fingerprint = `DO $$ DECLARE r record; v text; names text; BEGIN CREATE TEMP TABLE ct_farm_fingerprints(name text, digest text); FOR r IN SELECT key AS tablename,value AS cols FROM jsonb_each('${frozenColumns}'::jsonb) LOOP SELECT string_agg(format('%I',value #>> '{}'),',') INTO names FROM jsonb_array_elements(r.cols); EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text, chr(10) ORDER BY to_jsonb(t)::text), '''')) FROM (SELECT %s FROM %I) t',names,r.tablename) INTO v; INSERT INTO ct_farm_fingerprints VALUES(r.tablename,v); END LOOP; END $$; SELECT name || ':' || digest FROM ct_farm_fingerprints ORDER BY name;`;
const print = async dbName => (await docker(['sh', '-c', 'psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"', 'ct-farm', dbName], fingerprint)).toString().trim().split('\n').filter(Boolean);
const before = await print(database);
await exec(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], { cwd: root, env: childEnv, timeout: 60000 });
await exec(process.execPath, [prisma, 'migrate', 'diff', '--from-url', isolatedUrl.toString(), '--to-schema-datamodel', schema, '--exit-code'], { cwd: root, env: childEnv, timeout: 60000 });
const after = await print(database);
if (!before.every(line => after.includes(line))) throw new Error('기존 행 지문 변경: 적용 중단');
const report = { at: new Date().toISOString(), backup: path.relative(root, backup), restoreDatabase: database, nativePostgres: true, isolatedRestore: true, migrationDeploy: true, schemaDiff: false, preservedTables: before.length, appliedToExisting: false, uploadsIncluded:includeUploads,restoredFiles:capturedFiles.length,recoveryDirectory:recoveryDirectory?path.relative(root,recoveryDirectory):null,recoverySeconds:(Date.now()-drillStarted)/1000,consistency:includeUploads?'local API stopped during capture; external writers must also remain stopped':'database snapshot only',fileApiVerified:false };
if(includeUploads){
 const metadata=JSON.parse((await docker(['sh','-c','psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','ct-farm',database],`SELECT COALESCE(json_agg(json_build_object('key',"storageKey",'size',size,'sha256',sha256)),'[]') FROM "StoredFile" WHERE "deletedAt" IS NULL;`)).toString());
 for(const record of metadata){const item=capturedFiles.find(f=>f.name===record.key);if(!item||Buffer.byteLength(item.data,'base64')!==record.size||(record.sha256&&record.sha256!==item.sha256))throw Error('활성 DB 파일 메타데이터와 백업 불일치');}
 report.fileMetadataVerified=metadata.length;
 const checked=await exec(process.execPath,['--import','tsx',path.join(root,'tools/verify-restored-files.mts')],{cwd:root,env:{...childEnv,RESTORED_UPLOAD_DIR:recoveryDirectory},timeout:60000});
 report.fileApiResult=JSON.parse(checked.stdout.trim());report.fileApiVerified=true;
}
if(process.argv.includes('--test-operations')){
  const tested=await exec(process.execPath,['--import','tsx',path.join(root,'tools/test-farm.mts')],{cwd:root,env:{...childEnv,FARM_TEST_DATABASE_URL:isolatedUrl.toString()},timeout:60000});
  console.log(tested.stdout);report.operationsIntegration=true;
}
if (process.argv.includes('--apply-existing')) {
  // 원본 지문이 백업 당시와 같을 때만 기존 DB에 추가 마이그레이션을 적용합니다.
  const sourceBefore = await print(decodeURIComponent(sourceUrl.pathname.slice(1)));
  if (sourceBefore.join('\n') !== before.join('\n')) throw new Error('백업 후 원본 데이터가 변경됨: 적용 중단');
  await exec(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], { cwd: root, env: environment, timeout: 60000 });
  const sourceAfter = await print(decodeURIComponent(sourceUrl.pathname.slice(1)));
  if (!sourceBefore.every(line => sourceAfter.includes(line))) throw new Error('원본 DB의 기존 행 지문 불일치');
  report.appliedToExisting = true;
}
report.totalDrillSeconds=(Date.now()-drillStarted)/1000;
await fs.writeFile(path.join(root, 'verification/ct-farm-postgres.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
console.log('암호화 키는 .starter-state/ct-farm-backup.key에 별도 보관됩니다. 격리 복원 DB와 기존 볼륨은 삭제하지 않았습니다.');
