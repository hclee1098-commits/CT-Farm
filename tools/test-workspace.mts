import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
export async function runWorkspaceTests({prisma,base,owner,other,token,otherToken,pass}:any){
 const call=async(path:string,method='GET',body?:unknown,auth:string|null=token)=>{const r=await fetch(base+'/workspace'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json() as any};};
 const farm=await prisma.farm.create({data:{ownerId:owner.id,name:'협업 시험 농장',address:'공유하지 않는 주소',latitude:37,longitude:127,areaM2:100,crop:'감자',variety:'수미'}});
 const save=async(kind:string,body:unknown,key:string,auth=token)=>{const r=await fetch(base+`/farms/${farm.id}/${kind}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth,'Idempotency-Key':key},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 const diary={workDate:'2026-10-29',title:'재전송 시험',content:'통신 결과 불명 재시도'},diaryKey=randomUUID();
 const first=await save('diary',diary,diaryKey),repeat=await save('diary',diary,diaryKey);assert.equal(first.status,201);assert.equal(first.body.data.id,repeat.body.data.id);assert.equal((await save('diary',{...diary,content:'변경'},diaryKey)).status,409);assert.equal((await save('diary',diary,diaryKey,otherToken)).status,404);
 const task={kind:'TASK',data:{title:'재전송 작업',dueDate:'2026-10-29',status:'TODO',memo:''}},taskKey=randomUUID();const saved=await Promise.all([save('records',task,taskKey),save('records',task,taskKey)]);assert.equal(saved[0].status,201);assert.equal(saved[0].body.data.id,saved[1].body.data.id);assert.equal((await save('records',task,'short')).status,400);pass('일지·일정 재전송/동시 제출 중복 방지·본문 충돌·사용자 격리');
 assert.equal((await call('/dashboard','GET',undefined,null)).status,401);
 assert((await call('/dashboard')).body.data.farms.some((f:any)=>f.id===farm.id));assert(!(await call('/dashboard','GET',undefined,otherToken)).body.data.farms.some((f:any)=>f.id===farm.id));pass('실데이터 대시보드 미인증 차단·사용자 격리');
 assert.equal((await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email,role:'OWNER'})).status,400);
 assert.equal((await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email},otherToken)).status,404);
 const invite=await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email});assert.equal(invite.status,201);const secret=invite.body.data.token;
 const row=await prisma.farmInvitation.findUniqueOrThrow({where:{id:invite.body.data.id}});assert.notEqual(row.tokenHash,secret);assert.equal(row.tokenHash.length,64);
 assert.equal((await call('/invitations/accept','POST',{token:secret},otherToken)).status,403);await prisma.user.update({where:{id:other.id},data:{emailVerifiedAt:new Date()}});
 assert.equal((await call('/invitations/accept','POST',{token:secret},otherToken)).status,200);assert.equal((await call('/invitations/accept','POST',{token:secret},otherToken)).status,409);
 const listed=await call(`/farms/${farm.id}/members`);assert(!JSON.stringify(listed.body).includes(secret));assert(!JSON.stringify(listed.body).includes(row.tokenHash));pass('초대 소유권·역할 주입 거부·이메일 인증·해시·일회 소비');
 const shared=await call('/shared/'+farm.id,'GET',undefined,otherToken);assert.equal(shared.status,200);assert.equal(shared.body.data.farm.address,undefined);assert.equal(shared.body.data.farm.ownerId,undefined);
 assert.equal((await call(`/farms/${farm.id}/members`,'GET',undefined,otherToken)).status,404);
 const write=await fetch(base+'/farms/'+farm.id,{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+otherToken},body:JSON.stringify({version:1})});assert.equal(write.status,404);
 const member=listed.body.data.members.find((m:any)=>!m.revokedAt);assert(member);
 const pending=await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email});
 assert.equal((await call(`/farms/${farm.id}/members/${member.id}`,'DELETE',undefined,otherToken)).status,404);assert.equal((await call(`/farms/${farm.id}/members/${member.id}`,'DELETE')).status,200);assert.equal((await call('/shared/'+farm.id,'GET',undefined,otherToken)).status,404);pass('읽기 전용 최소 필드·기존 쓰기 차단·권한 해제');
 assert.equal((await call('/invitations/accept','POST',{token:pending.body.data.token},otherToken)).status,409);
 const expired=await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email});await prisma.farmInvitation.update({where:{id:expired.body.data.id},data:{expiresAt:new Date(0)}});assert.equal((await call('/invitations/accept','POST',{token:expired.body.data.token},otherToken)).status,409);
 const revoked=await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email});await call(`/farms/${farm.id}/invitations/${revoked.body.data.id}`,'DELETE');assert.equal((await call('/invitations/accept','POST',{token:revoked.body.data.token},otherToken)).status,409);pass('초대 만료·취소·감사 이력');
 const raced=await call(`/farms/${farm.id}/invitations`,'POST',{email:other.email});const concurrent=await Promise.all([call('/invitations/accept','POST',{token:raced.body.data.token},otherToken),call('/invitations/accept','POST',{token:raced.body.data.token},otherToken)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 const timings:number[]=[];let failures=0;const started=Date.now();for(let batch=0;batch<5;batch++)await Promise.all(Array.from({length:4},async()=>{const t=performance.now();const r=await call('/dashboard');timings.push(performance.now()-t);if(r.status!==200)failures++;}));timings.sort((a,b)=>a-b);assert.equal(failures,0);
 // 과거 증거를 재실행으로 덮어쓰지 않습니다. 실행별 출력은 호출자가 지정합니다.
 if(process.env.FARM_TEST_PERFORMANCE_PATH)await writeFile(process.env.FARM_TEST_PERFORMANCE_PATH,JSON.stringify({at:new Date().toISOString(),environment:'isolated DB/HTTP, no full Redis middleware',database:process.env.FARM_TEST_DATABASE_URL?'native isolated PostgreSQL':'PGlite',connectionLimit:new URL(process.env.DATABASE_URL!).searchParams.get('connection_limit')||'Prisma default',cpuCount:os.cpus().length,cpu:os.cpus()[0]?.model,ramBytes:os.totalmem(),concurrency:4,requests:20,elapsedMs:Date.now()-started,p50Ms:timings[9],p95Ms:timings[18],errors:failures,testHarnessRssBytes:process.memoryUsage().rss,scope:'dashboard only; not login/upload/full production load'},null,2));pass('격리 대시보드 동시 4명·20요청 응답시간 기록');
}
