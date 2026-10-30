import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {safeEvent,appendEvents,loadEvents,summarize,limits} from './core.mjs';
import {hubHandler} from './hub.mjs';
import {collectOnce} from './collector.mjs';
import {snapshots} from './portal-source.mjs';
const sample=(environment='LOCAL',overrides={})=>({id:crypto.randomUUID(),environment,service:'api',kind:'request',level:'info',time:new Date().toISOString(),statusCode:200,durationMs:10,...overrides});
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'secure-monitor-'));
test('환경 혼합·민감정보 차단, HTTP 오류·지연 집계, 중복 제거',()=>{
 const dir=temporary();try{const secret='jwt-cookie-user@example.com';const e=sample('LOCAL',{password:secret,message:secret,url:'/?token='+secret,headers:{cookie:secret}});
 appendEvents(dir,'LOCAL',[e,sample('LOCAL',{statusCode:500,level:'error',durationMs:30}),sample('LOCAL',{kind:'start'})]);appendEvents(dir,'STAGING',[sample('STAGING',{statusCode:403})]);assert.throws(()=>appendEvents(dir,'LOCAL',[sample('PRODUCTION')]));
 assert.ok(!JSON.stringify(loadEvents(dir,'LOCAL')).includes(secret));const a=summarize(loadEvents(dir,'LOCAL'),'LOCAL');assert.equal(a.requests,2);assert.equal(a.errors,1);assert.equal(a.errorRate,.5);assert.equal(a.meanLatency,20);assert.equal(summarize(loadEvents(dir,'STAGING'),'STAGING').requests,1);assert.equal(summarize([],'PRODUCTION').requests,null);appendEvents(dir,'LOCAL',[e]);assert.equal(loadEvents(dir,'LOCAL').filter(x=>x.id===e.id).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('관측 만료·수집 중단·재연결·보관 기간',()=>{
 const heartbeat=sample('LOCAL',{service:'collector',kind:'heartbeat',status:'up'}),health=sample('LOCAL',{kind:'health',status:'down'});
 assert.equal(summarize([heartbeat,health],'LOCAL').collector.status,'connected');assert.equal(summarize([heartbeat,health],'LOCAL').services.api.status,'down');assert.equal(summarize([heartbeat,health],'LOCAL',60,Date.now()+60000).collector.status,'stale');assert.equal(summarize([heartbeat,health],'LOCAL',60,Date.now()+60000).services.api.status,'unknown');assert.equal(summarize([heartbeat,health,sample('LOCAL',{kind:'health',status:'up'})],'LOCAL').services.api.status,'up');assert.throws(()=>safeEvent(sample('LOCAL',{time:new Date(Date.now()-8*86400000).toISOString()}),'LOCAL'));
});
test('실제 HTTP 수집기: 의존성 장애·복구 및 세 환경 분리',async()=>{
 const dir=temporary();let ready=true;const api=http.createServer((q,r)=>r.writeHead(ready?200:503,{'Content-Type':'application/json'}).end(JSON.stringify({data:{database:ready?'ready':'down',redis:'ready'}}))),web=http.createServer((q,r)=>r.end('{}'));await new Promise(r=>api.listen(0,'127.0.0.1',r));await new Promise(r=>web.listen(0,'127.0.0.1',r));const config={env:'LOCAL',dir,api:`http://127.0.0.1:${api.address().port}`,web:`http://127.0.0.1:${web.address().port}`};
 try{await collectOnce(config);assert.equal(summarize(loadEvents(dir,'LOCAL'),'LOCAL').services.database.status,'up');ready=false;await collectOnce(config);assert.equal(summarize(loadEvents(dir,'LOCAL'),'LOCAL').services.database.status,'down');assert.equal(summarize(loadEvents(dir,'LOCAL'),'LOCAL').services.redis.status,'up');ready=true;await collectOnce(config);assert.equal(summarize(loadEvents(dir,'LOCAL'),'LOCAL').services.database.status,'up');const all=await snapshots({dir,env:'ALL',source:{}});assert.deepEqual(all.map(e=>e.environment),['LOCAL','STAGING','PRODUCTION']);assert.equal(all[1].connection,'not_configured');
 }finally{api.closeAllConnections();web.closeAllConnections();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>web.close(r))]);fs.rmSync(dir,{recursive:true,force:true});}
});
test('실제 TLS hub: 환경별 인증·읽기/쓰기 권한·재전송 중복 제거',async()=>{
 const dir=temporary(),keys=Object.fromEntries(['LOCAL','STAGING','PRODUCTION'].map(e=>[e,{read:crypto.randomBytes(32).toString('hex'),write:crypto.randomBytes(32).toString('hex')}]));execFileSync(process.env.OPENSSL_BIN || 'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key'),'-out',path.join(dir,'cert'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const server=https.createServer({key:fs.readFileSync(path.join(dir,'key')),cert:fs.readFileSync(path.join(dir,'cert'))},hubHandler({dir,keys}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const call=(route,token,body)=>new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:body?'POST':'GET',rejectUnauthorized:false,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 try{assert.equal((await call('/v1/snapshot?environment=LOCAL','invalid')).status,401);assert.equal((await call('/v1/snapshot?environment=PRODUCTION',keys.LOCAL.read)).status,403);assert.equal((await call('/v1/events',keys.LOCAL.read,{environment:'LOCAL',events:[]})).status,403);assert.equal((await call('/v1/events',keys.LOCAL.write,{environment:'STAGING',events:[]})).status,403);const body={environment:'LOCAL',events:[sample()]};assert.equal((await call('/v1/events',keys.LOCAL.write,body)).status,202);await call('/v1/events',keys.LOCAL.write,body);assert.equal((await call('/v1/snapshot?environment=LOCAL',keys.LOCAL.read)).body.requests,1);assert.equal((await call('/v1/snapshot?environment=LOCAL',keys.LOCAL.write)).status,403);for(const env of ['STAGING','PRODUCTION']){assert.equal((await call('/v1/events',keys[env].write,{environment:env,events:[sample(env)]})).status,202);const snap=await call('/v1/snapshot?environment='+env,keys[env].read);assert.equal(snap.body.environment,env);assert.equal(snap.body.requests,1);assert.ok(snap.body.events.every(e=>e.environment===env));}assert.equal((await call('/v1/events',keys.LOCAL.write,{environment:'LOCAL',events:[sample('PRODUCTION')]})).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('배치 한도·손상 행 격리·파일 용량 제한',()=>{const dir=temporary();try{for(let i=0;i<3;i++)appendEvents(dir,'LOCAL',Array.from({length:200},()=>sample()));assert.ok(fs.statSync(path.join(dir,'LOCAL/api.jsonl')).size<limits.maxBytes);fs.appendFileSync(path.join(dir,'LOCAL/api.jsonl'),'invalid json\n');assert.equal(loadEvents(dir,'LOCAL').length,600);assert.throws(()=>appendEvents(dir,'LOCAL',Array.from({length:201},()=>sample())));}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('전송 실패 격리·로컬 보존·재연결·ACK 이후 커서 갱신',async()=>{
 const dir=temporary(),remote=temporary(),original=globalThis.fetch;let fail=true;
 const api=http.createServer((q,r)=>r.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({data:{database:'ready',redis:'ready'}}))),web=http.createServer((q,r)=>r.end('{}'));await new Promise(r=>api.listen(0,'127.0.0.1',r));await new Promise(r=>web.listen(0,'127.0.0.1',r));
 globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://monitor.invalid')){if(fail)return Response.json({error:'offline'},{status:503});const body=JSON.parse(options.body);appendEvents(remote,body.environment,body.events);return Response.json({accepted:body.events.length},{status:202});}return original(url,options);};
 const config={env:'STAGING',dir,api:`http://127.0.0.1:${api.address().port}`,web:`http://127.0.0.1:${web.address().port}`,remote:'https://monitor.invalid',token:'x'.repeat(40)};
 try{appendEvents(dir,'STAGING',[sample('STAGING',{version:'a'.repeat(40)})]);await assert.rejects(collectOnce(config));assert.ok(loadEvents(dir,'STAGING').length>0);assert.ok(!fs.existsSync(path.join(dir,'STAGING/forward-cursor.json')));assert.equal((await original(config.api)).status,200);fail=false;await collectOnce(config);assert.ok(fs.existsSync(path.join(dir,'STAGING/forward-cursor.json')));assert.ok(loadEvents(remote,'STAGING').some(e=>e.version==='a'.repeat(40)));await collectOnce(config);const rows=loadEvents(remote,'STAGING');assert.equal(new Set(rows.map(e=>e.id)).size,rows.length);assert.ok(rows.every(e=>e.environment==='STAGING'));
 }finally{globalThis.fetch=original;api.closeAllConnections();web.closeAllConnections();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>web.close(r))]);fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(remote,{recursive:true,force:true});}
});
