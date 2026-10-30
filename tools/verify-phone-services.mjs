// 임시 API의 합성 회귀 로그와 준비 상태만 공개 증거로 보존합니다.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const dir='verification/ui-mobile/phone-services',report={startedAt:new Date().toISOString(),command:'node tools/verify-phone-services.mjs',checks:[],originalApiAccessed:false};await fs.mkdir(dir,{recursive:true});
try{
 const q=JSON.parse(await fs.readFile('.starter-state/phone-test/qa.json','utf8')),url=new URL(q.apiBase);assert.equal(url.hostname,'127.0.0.1');assert(!['3000','4000'].includes(url.port));assert(q.expiresAt>Date.now());
 const raw=(await fs.readFile('.starter-state/phone-test/phone-api.log','utf8')).split('USB 시험 API 준비 완료')[0],summary=raw.split(/\r?\n/).find(s=>s.startsWith('{"checks":'));
 const result=JSON.parse(summary);assert.equal(result.checks,13);assert.equal(result.syntheticOnly,true);assert.equal(result.originalDatabaseAccessed,false);await fs.writeFile(path.join(dir,'api-regression.log'),raw);report.nativeApi={...result,rawLog:path.join(dir,'api-regression.log')};
 for(const [name,url] of [['isolated API readiness',new URL('/health/ready',q.apiBase).href],['Metro status','http://127.0.0.1:18081/status']]){const startedAt=new Date().toISOString(),r=await fetch(url,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);report.checks.push({name,startedAt,endedAt:new Date().toISOString(),status:r.status});await r.text();}
 report.status='passed';report.exitCode=0;console.log('격리 API 13그룹 및 API/Metro HTTP 준비 검사 통과');
}catch(e){report.status='failed';report.error=e.message;report.exitCode=1;process.exitCode=1;}finally{report.endedAt=new Date().toISOString();await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify(report,null,2));}
