// 서버 전용 명령. 로컬 생명주기 스크립트는 이 파일을 호출하지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {appendEvents,environment} from '../monitoring/core.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export function validateManifest(manifest){
 if(!/^[a-f\d]{40}$/i.test(manifest.version||'')||manifest.format!==1)throw Error('MANIFEST');
 for(const key of ['api','web','migrate','collector'])if(!/^ghcr\.io\/[a-z\d_./-]+@sha256:[a-f\d]{64}$/.test(manifest.images?.[key]||''))throw Error('IMMUTABLE_IMAGE_REQUIRED');
 if(manifest.verified!==true)throw Error('VERIFICATION_REQUIRED');return manifest;
}
export function verifyProof(proof,bytes,publicKey,scope){
 if(!Number.isFinite(Date.parse(proof.time))||proof.scope!==scope||proof.manifestHash!==digest(bytes)||Date.now()-Date.parse(proof.time)>86400000||Date.parse(proof.time)>Date.now()+30000)throw Error('PROOF_SCOPE');
 const payload=Buffer.from(JSON.stringify({scope:proof.scope,manifestHash:proof.manifestHash,time:proof.time}));
 if(!crypto.verify(null,payload,publicKey,Buffer.from(proof.signature,'base64')))throw Error('PROOF_SIGNATURE');return true;
}
export function signProof(bytes,privateKey,scope){const payload={scope,manifestHash:digest(bytes),time:new Date().toISOString()};return {...payload,signature:crypto.sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')};}
export function validateServer(env){
 const name=environment(env.APP_ENV);if(!['STAGING','PRODUCTION'].includes(name))throw Error('SERVER_ONLY');
 const prefix=name==='STAGING'?'staging':'production';if(env.DEPLOY_ENV!==prefix||!/^secure-[a-z0-9-]+$/.test(env.APP_ID||'')||env.POSTGRES_DB!==`${env.APP_ID.replaceAll('-','_')}_${prefix}`)throw Error('ENVIRONMENT_ISOLATION');
 const db=new URL(env.DATABASE_URL);if(db.hostname!=='postgres'||decodeURIComponent(db.pathname.slice(1))!==env.POSTGRES_DB||decodeURIComponent(db.username)!==env.POSTGRES_USER||decodeURIComponent(db.password)!==env.POSTGRES_PASSWORD)throw Error('DATABASE_SCOPE');
 if(!/^[a-z\d.-]+$/.test(env.SITE_DOMAIN||'')||!env.SITE_DOMAIN.includes('.'))throw Error('DOMAIN');
 const keys=[env.POSTGRES_PASSWORD,env.JWT_ACCESS_SECRET,env.MONITOR_WRITE_TOKEN,env.BACKUP_KEY];if(keys.some(v=>!v||v.length<32||/replace|change|example/i.test(v))||new Set(keys).size!==keys.length)throw Error('UNIQUE_SECRETS');
 if(!/^[a-f\d]{64}$/i.test(env.MFA_ENCRYPTION_KEY||'')||!/^([a-f\d]{64})$/i.test(env.BACKUP_KEY||''))throw Error('HEX_KEY');return name;
}
async function run(args,{output}={}){
 await new Promise((resolve,reject)=>{const child=spawn('docker',args,{cwd:root,env:process.env,stdio:['ignore',output||'ignore','ignore']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('DOCKER_COMMAND_FAILED')));});
}
async function encryptedCapture(args,file){
 const key=Buffer.from(process.env.BACKUP_KEY,'hex'),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const child=spawn('docker',args,{cwd:root,stdio:['ignore','pipe','ignore']});let failed;
 const exit=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('BACKUP_FAILED')));});exit.catch(e=>{failed=e;});
 fs.writeFileSync(file,Buffer.concat([Buffer.from('SSV6DEP1'),iv]),{mode:0o600});
 await pipeline(child.stdout,cipher,fs.createWriteStream(file,{flags:'a'}));await exit;if(failed)throw failed;fs.appendFileSync(file,cipher.getAuthTag());
}
export async function health(base){
 const url=new URL(base);if(url.protocol!=='https:')throw Error('HTTPS_REQUIRED');
 for(const [route,status]of [['/health/ready',200],['/api/monitor-health',200],['/api/v1/auth/me',401]]){
  const response=await fetch(new URL(route,url),{redirect:'error',signal:AbortSignal.timeout(10000)});if(response.status!==status)throw Error('POST_DEPLOY_CHECK_FAILED');
 }
}
async function main(){
 const [action,manifestPath]=process.argv.slice(2);if(!['deploy','rollback','approve'].includes(action)||!manifestPath)throw Error('USAGE');
 const bytes=fs.readFileSync(manifestPath),manifest=validateManifest(JSON.parse(bytes));
 if(action==='approve'){const proof=signProof(bytes,fs.readFileSync(process.env.PRODUCTION_APPROVAL_PRIVATE_KEY),'PRODUCTION_APPROVED');fs.writeFileSync(manifestPath+'.approval.json',JSON.stringify(proof),{mode:0o600});return;}
 const env=validateServer(process.env),stateDir=path.join(root,'.starter-state/releases',env);fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
 const lock=path.join(stateDir,'deploy.lock');const fd=fs.openSync(lock,'wx');let approved=false,previous,stopped=false,success=false;
 const compose=['compose','--env-file',process.env.DEPLOY_ENV_FILE||`deploy/${env.toLowerCase()}.env`,'-f','compose.server.yaml'];
 const record=(result,kind=action==='rollback'?'rollback':'deploy')=>{try{appendEvents(process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),env,[{id:crypto.randomUUID(),environment:env,time:new Date().toISOString(),service:'deployment',kind,level:result==='failed'?'error':'info',version:manifest.version,result,approved,verified:manifest.verified}]);}catch{console.error('배포 이벤트 기록 실패');}};
 const setImages=m=>{for(const key of ['api','web','migrate','collector'])process.env[key.toUpperCase()+'_IMAGE']=m.images[key];process.env.DEPLOY_VERSION=m.version;};
 try{
  if(env==='PRODUCTION'){
   verifyProof(JSON.parse(fs.readFileSync(manifestPath+'.staging.json')),bytes,fs.readFileSync(process.env.STAGING_RECEIPT_PUBLIC_KEY),'STAGING_VERIFIED');
   verifyProof(JSON.parse(fs.readFileSync(manifestPath+'.approval.json')),bytes,fs.readFileSync(process.env.PRODUCTION_APPROVAL_PUBLIC_KEY),'PRODUCTION_APPROVED');approved=true;
  }
  try{previous=JSON.parse(fs.readFileSync(path.join(stateDir,'current.json')));}catch{}
  if(path.resolve(process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'))!==path.join(root,'.starter-state/monitoring'))throw Error('MONITOR_PATH_SCOPE');
  if(previous&&process.env.DEPLOY_ALLOW_UNHEALTHY!=='1')await health('https://'+process.env.SITE_DOMAIN);
  setImages(manifest);await run([...compose,'config','--quiet']);await run([...compose,'pull']);
  // 초기 배포에서도 DB/Redis 먼저 준비합니다. 기존 볼륨 삭제/재생성 없음.
  await run([...compose,'up','-d','--wait','postgres','redis']);
  await run([...compose,'stop','api','web']);stopped=true;
  // 암호화 DB+업로드 백업. 백업이 실패하면 마이그레이션을 실행하지 않습니다.
  const backupDir=path.join(stateDir,'backups',Date.now().toString());fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
  try {
  await encryptedCapture([...compose,'exec','-T','postgres','pg_dump','-Fc','--no-owner','--no-privileges','-U',process.env.POSTGRES_USER,process.env.POSTGRES_DB],path.join(backupDir,'database.enc'));
  await encryptedCapture([...compose,'run','--rm','--no-deps','--entrypoint','tar','api','-czf','-','-C','/app/apps/api','uploads'],path.join(backupDir,'uploads.enc'));
  appendEvents(process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),env,[{id:crypto.randomUUID(),time:new Date().toISOString(),environment:env,service:'backup',kind:'backup',level:'info',result:'success',version:manifest.version}]);
  }catch(error){try{appendEvents(process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),env,[{id:crypto.randomUUID(),time:new Date().toISOString(),environment:env,service:'backup',kind:'backup',level:'error',result:'failed',version:manifest.version}]);}catch{}throw error;}
  if(action==='deploy'&&process.env.DEPLOY_MIGRATE==='1'){
   if(manifest.backwardCompatible!==true)throw Error('MIGRATION_COMPATIBILITY_REVIEW_REQUIRED');
   await run([...compose,'--profile','tools','run','--rm','migrate']);
  }
  await run([...compose,'up','-d','--wait','api','web','collector','proxy']);
  let healthy=false;for(let attempt=0;attempt<6;attempt++){try{await health('https://'+process.env.SITE_DOMAIN);healthy=true;break;}catch{await new Promise(r=>setTimeout(r,2000));}}if(!healthy)throw Error('HEALTH_FAILED');
  if(previous)fs.writeFileSync(path.join(stateDir,'previous.json'),JSON.stringify(previous),{mode:0o600});
  fs.writeFileSync(path.join(stateDir,'current.json'),bytes,{mode:0o600});
  if(env==='STAGING')fs.writeFileSync(manifestPath+'.staging.json',JSON.stringify(signProof(bytes,fs.readFileSync(process.env.STAGING_RECEIPT_PRIVATE_KEY),'STAGING_VERIFIED')),{mode:0o600});
  record('success');success=true;
 }catch(error){record('failed');
  if(stopped&&previous){setImages(previous);try{await run([...compose,'up','-d','--wait','api','web','collector','proxy']);await health('https://'+process.env.SITE_DOMAIN);appendEvents(process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),env,[{id:crypto.randomUUID(),time:new Date().toISOString(),environment:env,service:'deployment',kind:'rollback',level:'warn',result:'success',version:previous.version,approved,verified:true}]);}catch{console.error('자동 애플리케이션 롤백 실패: DB는 자동 복원하지 않았습니다.');}}
  throw error;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);if(!success)console.error('배포 실패: 마이그레이션 적용 여부를 확인하세요. DB 자동 롤백 없음.');}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('배포 중단: 환경, 승인 서명, 백업 또는 헬스체크를 확인하세요. 비밀정보 출력 없음.');process.exitCode=1;});
