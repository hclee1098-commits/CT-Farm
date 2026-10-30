// 브라우저 시험 전용: 복원 DB·임시 Redis·별도 업로드와 포트만 사용합니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {startDockerRedis} from './isolated-redis.mjs';
import {PrismaClient} from '@prisma/client';
const root=process.cwd();const report=JSON.parse(await fs.readFile('verification/ct-farm-round4-migration.json','utf8'));
const stopFile=path.join(root,'.starter-state/round4-qa-stop');await fs.unlink(stopFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
if(!report.isolatedRestore||!report.fileApiVerified||!/^ct_farm_verify_[a-f0-9]{12}$/.test(report.restoreDatabase))throw Error('DB+파일 격리 복원 검증이 먼저 필요합니다.');
const env=dotenv.parse(await fs.readFile('apps/api/.env'));const database=new URL(env.DATABASE_URL);database.pathname='/'+report.restoreDatabase;
if(!['localhost','127.0.0.1'].includes(database.hostname))throw Error('로컬 격리 DB만 허용');
// 복원된 원래 사용자의 refresh 쿠키가 QA 세션으로 재사용되지 않도록 격리 복사본에서만 폐기합니다.
const scrub=new PrismaClient({datasourceUrl:database.toString()});await scrub.refreshSession.deleteMany();await scrub.$disconnect();
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const redis=await startDockerRedis(port);const uploads=path.join(root,'verification/runtime/round4-qa-uploads');await fs.mkdir(uploads,{recursive:true});
const api=spawn(process.execPath,['dist/bootstrap/server.js'],{cwd:path.join(root,'apps/api'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',APP_ENV:'LOCAL',PORT:'4104',DATABASE_URL:database.toString(),REDIS_URL:`redis://127.0.0.1:${port}`,CORS_ORIGINS:'http://127.0.0.1:3004',JWT_ACCESS_SECRET:randomBytes(40).toString('hex'),MFA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),UPLOAD_DIR:uploads,LOG_LEVEL:'fatal',AI_MODE:'REFERENCE',PAYMENT_MODE:'DISABLED',WEATHER_MODE:'DISABLED',FARM_ASSISTANT_ENABLED:'false'}});
let diagnostic='';for(const stream of [api.stdout,api.stderr])stream.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-4000);});
try{
 let ready=false;for(let i=0;i<120;i++){if(api.exitCode!==null||api.signalCode!==null)break;try{ready=(await fetch('http://127.0.0.1:4104/health/ready',{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!ready){const safe=diagnostic.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi,'[주소 생략]').replace(/[A-Za-z0-9_@.+-]{24,}/g,'[긴 값 생략]');throw Error('격리 QA API 시작 실패: '+safe);}console.log('ROUND4 QA API 준비: 127.0.0.1:4104, 웹 CORS: 127.0.0.1:3004, 복원 세션 폐기, 원본 DB·파일·Redis 사용 안 함');
 await fs.writeFile(path.join(root,'.starter-state/round4-qa-runtime.json'),JSON.stringify({apiPid:api.pid,redisId:redis.id,redisName:redis.name,scope:'isolated QA only'}),{mode:0o600});
 await new Promise(r=>{const timer=setInterval(async()=>{try{await fs.stat(stopFile);clearInterval(timer);r();}catch{}},250);const finish=()=>{clearInterval(timer);r();};process.once('SIGINT',finish);process.once('SIGTERM',finish);api.once('exit',finish);});
}finally{if(api.exitCode===null&&api.signalCode===null){const ended=once(api,'exit');api.kill('SIGTERM');await ended;}await redis.stop();}
