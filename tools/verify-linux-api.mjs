// Linux 이미지를 로컬 격리 DB·Redis에 연결합니다. 클라우드 배포나 HTTPS 완료 검증이 아닙니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import dotenv from 'dotenv';
import {startDockerRedis} from './isolated-redis.mjs';
const exec=promisify(execFile),root=process.cwd();const report=JSON.parse(await fs.readFile('verification/ct-farm-round4-migration.json','utf8'));
if(!report.isolatedRestore||!/^ct_farm_verify_[a-f0-9]{12}$/.test(report.restoreDatabase))throw Error('격리 DB 필요');
const env=dotenv.parse(await fs.readFile('apps/api/.env'));const database=new URL(env.DATABASE_URL);if(!['localhost','127.0.0.1'].includes(database.hostname))throw Error('원격 DB 거부');database.hostname='host.docker.internal';database.pathname='/'+report.restoreDatabase;
async function port(){const p=createServer();await new Promise(r=>p.listen(0,'127.0.0.1',r));const n=p.address().port;await new Promise(r=>p.close(r));return n;}
const redis=await startDockerRedis(await port()),apiPort=await port(),file=path.join(root,'.starter-state','linux-test-'+randomUUID()+'.env');let id;const started=Date.now();
try{
 const values={NODE_ENV:'production',APP_ENV:'STAGING',PORT:'4000',DATABASE_URL:database.toString(),REDIS_URL:`redis://host.docker.internal:${redis.port}`,CORS_ORIGINS:'https://localhost',JWT_ACCESS_SECRET:randomBytes(40).toString('hex'),MFA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),LOG_LEVEL:'fatal',PAYMENT_MODE:'DISABLED',AI_MODE:'REFERENCE',WEATHER_MODE:'DISABLED',FARM_ASSISTANT_ENABLED:'false',UPLOAD_DIR:'/app/apps/api/uploads'};
 await fs.writeFile(file,Object.entries(values).map(([k,v])=>k+'='+v).join('\n'),{flag:'wx',mode:0o600});
 id=(await exec('docker',['run','--pull=never','--detach','--rm','--label','ct-farm.test=linux-api','--read-only','--tmpfs','/tmp:rw,size=32m','--tmpfs','/app/apps/api/uploads:rw,uid=1000,gid=1000,mode=0700,size=16m','--cap-drop=ALL','--security-opt','no-new-privileges','--env-file',file,'-p',`127.0.0.1:${apiPort}:4000`,'ct-farm-round4-api:local'],{timeout:20000,windowsHide:true})).stdout.trim();if(!/^[a-f0-9]{64}$/.test(id))throw Error('컨테이너 ID 오류');
 let ready=false;for(let i=0;i<40;i++){try{ready=(await fetch(`http://127.0.0.1:${apiPort}/health/ready`,{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('Linux API readiness 실패');
 const platform=(await exec('docker',['exec',id,'node','-p','process.platform'],{timeout:5000})).stdout.trim();const uid=(await exec('docker',['exec',id,'id','-u'],{timeout:5000})).stdout.trim();if(platform!=='linux'||uid==='0')throw Error('Linux 비루트 실행 검증 실패');
 const output={at:new Date().toISOString(),image:'ct-farm-round4-api:local',platform,uid,readOnlyRoot:true,capabilitiesDropped:true,nativePostgres:true,isolatedRedis:true,readiness:true,elapsedSeconds:(Date.now()-started)/1000,appEnvironment:'STAGING',scope:'local Linux API container only; no real domain, TLS, web container or production rollout',httpsVerified:false};
 await fs.writeFile('verification/ct-farm-round4-linux.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
}finally{if(id&&/^[a-f0-9]{64}$/.test(id))await exec('docker',['stop','--time','3',id],{timeout:10000,windowsHide:true}).catch(()=>{});await redis.stop();await fs.unlink(file).catch(()=>{});}
