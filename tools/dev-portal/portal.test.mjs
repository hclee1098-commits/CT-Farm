import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPortal} from './server.mjs';
import {analyze,root} from '../analyze-project.mjs';
const token='test-only-'+ 'x'.repeat(40);
test('운영환경 차단 및 키 누락 차단',()=>{assert.throws(()=>createPortal({token:''}));const old=process.env.NODE_ENV;process.env.NODE_ENV='production';try{assert.throws(()=>createPortal({token}));}finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}});
test('접근 통제, 경로 탐색, 변경 요청, 메타데이터와 SSE',async()=>{const server=createPortal({token});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;try{
 assert.equal((await fetch(base+'/metadata')).status,401);
 assert.equal((await fetch(base+'/metadata',{headers:{Authorization:'Bearer '+token,Origin:'https://attacker.invalid'}})).status,403);
 assert.equal(await new Promise(resolve=>{http.get(base+'/metadata',{headers:{Host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode);});}),403);
 assert.equal((await fetch(base+'/metadata',{method:'POST',headers:{Authorization:'Bearer '+token}})).status,405);
 assert.equal((await fetch(base+'/files?path=../../etc/passwd',{headers:{Authorization:'Bearer '+token}})).status,404);
 const response=await fetch(base+'/metadata',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);const data=await response.json();assert.ok(data.files.length>100);assert.ok(!data.files.some(f=>f.path.endsWith('.env')));assert.ok(!JSON.stringify(data).includes(token));
 const controller=new AbortController();const stream=await fetch(base+'/events',{headers:{Authorization:'Bearer '+token},signal:controller.signal});assert.match(stream.headers.get('content-type'),/event-stream/);const reader=stream.body.getReader();await reader.read();const event=await reader.read();assert.match(new TextDecoder().decode(event.value),/수집되지 않음/);controller.abort();
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}});
test('분석 참조와 문서 경로의 실재 여부',()=>{const data=analyze(),paths=new Set(data.files.map(f=>f.path));for(const f of data.files){assert.ok(fs.existsSync(root+'/'+f.path));for(const p of [...f.internalDependencies,...f.usedBy,...f.tests,...f.documents])assert.ok(paths.has(p),p);assert.ok(!('source' in f));}assert.equal(new Set(data.files.map(f=>f.path)).size,data.files.length);});
test('운영 Docker 이미지가 포털을 복사하지 않음',()=>{for(const p of ['deploy/Dockerfile.api','deploy/Dockerfile.web']){const text=fs.readFileSync(root+'/'+p,'utf8');assert.ok(!/^COPY\s+\.\s/m.test(text));assert.ok(!text.includes('dev-portal'));}});
