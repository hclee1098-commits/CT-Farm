// 복원 DB와 비공개 격리 저장소에서만 실제 파일 API를 검사합니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import express from 'express';
import {createServer} from 'node:http';
import {startDockerRedis} from './isolated-redis.mjs';
const database=new URL(process.env.DATABASE_URL!);
const root=path.resolve(process.cwd(),'verification/runtime');const uploads=path.resolve(process.env.RESTORED_UPLOAD_DIR||'');
if(!['127.0.0.1','localhost'].includes(database.hostname)||!/^\/ct_farm_verify_[a-f0-9]{12}$/.test(database.pathname)||!uploads.startsWith(root+path.sep))throw Error('격리 복원 경로만 허용');
Object.assign(process.env,{NODE_ENV:'test',APP_ENV:'LOCAL',UPLOAD_DIR:uploads,LOG_LEVEL:'fatal',JWT_ACCESS_SECRET:randomBytes(40).toString('hex'),MFA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),CORS_ORIGINS:'http://localhost:3000'});
const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const redisPort=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
const testRedis=await startDockerRedis(redisPort);process.env.REDIS_URL=`redis://127.0.0.1:${redisPort}`;
const {prisma}=await import('../apps/api/src/infrastructure/prisma');
const {filesRouter}=await import('../apps/api/src/modules/files/files.controller');
const {createAccessToken}=await import('../apps/api/src/common/auth.middleware');
const {globalErrorHandler}=await import('../apps/api/src/bootstrap/error-handler');
const {closeRedis}=await import('../apps/api/src/infrastructure/redis');
const app=express();app.use('/files',filesRouter);app.use(globalErrorHandler);const server=createServer(app);let verified=0,denied=0;
try{
 const outsider=await prisma.user.create({data:{email:`restore-${randomUUID()}@example.test`,name:'복원 검사 전용',passwordHash:'not-a-valid-login-hash'}});
 const otherToken=createAccessToken(outsider.id,0);
 const files=await prisma.storedFile.findMany({where:{deletedAt:null,owner:{deletedAt:null,suspendedAt:null}},include:{owner:{select:{tokenVersion:true}}}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 for(const f of files){
  const r=await fetch(`${base}/files/${f.id}/download`,{headers:{Authorization:'Bearer '+createAccessToken(f.ownerId,f.owner.tokenVersion)}});if(r.status!==200)throw Error('복원 파일 API 조회 실패');
  const bytes=Buffer.from(await r.arrayBuffer());const original=await fs.readFile(path.join(uploads,f.storageKey));if(createHash('sha256').update(bytes).digest('hex')!==createHash('sha256').update(original).digest('hex'))throw Error('복원 API 파일 해시 불일치');verified++;
  const forbidden=await fetch(`${base}/files/${f.id}/download`,{headers:{Authorization:'Bearer '+otherToken}});await forbidden.arrayBuffer();if(forbidden.status!==404)throw Error('복원 파일 타인 접근 차단 실패');denied++;
 }
 console.log(JSON.stringify({verified,denied,scope:'native isolated restore and actual authenticated file API'}));
}finally{server.closeAllConnections();if(server.listening)await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();await closeRedis();await testRedis.stop();}
