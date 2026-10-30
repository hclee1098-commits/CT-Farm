import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {enqueueTransitions,dispatchOne,smtpAdapter,webhookAdapter} from './delivery.mjs';
import {readIncidents,processIncidents} from './incidents.mjs';
import {withStateLock} from './state-lock.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('중복 억제·실패 재시도·공급자 접수와 수신 구분·복구 발송',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctfarm-round5-alert-'));try{
 const t={incidentId:crypto.randomUUID(),service:'api',transition:'OPEN'};enqueueTransitions(dir,'LOCAL',[t,t]);assert.equal(readIncidents(dir,'LOCAL').deliveries.length,1);
 assert.equal((await dispatchOne(dir,'LOCAL',null)).status,'NOT_CONFIGURED');
 assert.equal((await dispatchOne(dir,'LOCAL',{send:async()=>{throw Error('synthetic');}},{now:100})).status,'RETRY');
 assert.equal((await dispatchOne(dir,'LOCAL',{send:async()=>{}},{now:200})).status,'IDLE');
 const result=await dispatchOne(dir,'LOCAL',{send:async()=>{}},{now:3000});assert.equal(result.status,'PROVIDER_ACCEPTED');assert.equal(result.actualReceiptVerified,false);
 enqueueTransitions(dir,'LOCAL',[{...t,transition:'RECOVERED'}]);let calls=0;const adapter={send:async()=>{calls++;await new Promise(r=>setTimeout(r,20));}};await Promise.all([dispatchOne(dir,'LOCAL',adapter,{now:4000}),dispatchOne(dir,'LOCAL',adapter,{now:4000})]);assert.equal(calls,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('동시 상태 변경 잠금·잠금 해제·예외 시 원본 보존',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctfarm-round5-alert-'));try{const file=path.join(dir,'state');withStateLock(file,()=>assert.throws(()=>withStateLock(file,()=>{}),/INCIDENT_BUSY/));assert(!fs.existsSync(file+'.lock'));assert.throws(()=>withStateLock(file,()=>{throw Error('fixture');}));assert(!fs.existsSync(file+'.lock'));
 const e={id:crypto.randomUUID(),environment:'LOCAL',service:'api',status:'down',kind:'health',level:'error',time:new Date().toISOString()};processIncidents(dir,'LOCAL',[e]);const target=path.join(dir,'LOCAL/incidents.json');withStateLock(target,()=>assert.throws(()=>processIncidents(dir,'LOCAL',[e]),/INCIDENT_BUSY/));assert.equal(readIncidents(dir,'LOCAL').incidents.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('외부 미설정·안전한 온콜 접수·리다이렉트/실패 처리',async()=>{
 assert.equal(smtpAdapter({}),null);assert.throws(()=>webhookAdapter({url:'http://fixture.invalid',token:'x'.repeat(32)}));let event;
 const adapter=webhookAdapter({url:'https://fixture.invalid/events',token:'x'.repeat(32)},async(url,options)=>{event=options;return {ok:true};});await adapter.send({service:'api',transition:'OPEN',key:'fixture'});assert.equal(event.redirect,'error');assert.equal(event.headers['Idempotency-Key'],'fixture');
 await assert.rejects(webhookAdapter({url:'https://fixture.invalid',token:'x'.repeat(32)},async()=>({ok:false})).send({}),/ONCALL_NOT_ACCEPTED/);
});
test('8개 독립 프로세스가 사건을 동시에 저장해도 갱신 유실 없음',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctfarm-round5-alert-'));try{
 await Promise.all(['api','web','database','redis','disk','backup','deployment','collector'].map(service=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../round5/incident-writer.mjs',import.meta.url)),dir,service],{stdio:'ignore',windowsHide:true});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('WORKER_FAILED')));})));assert.equal(readIncidents(dir,'LOCAL').incidents.length,8);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
