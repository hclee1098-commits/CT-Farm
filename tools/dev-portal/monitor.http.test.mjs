import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortal} from './server.mjs';
test('통합 모니터링 HTTP 인증·환경 선택·SSE·필터 검증',async()=>{
 const token='http-monitor-test-'+ 'x'.repeat(32),server=createPortal({token});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token};
 try{
 assert.equal((await fetch(base+'/monitor?environment=PRODUCTION')).status,401);
 assert.equal((await fetch(base+'/monitor?environment=invalid',{headers})).status,400);
 assert.equal((await fetch(base+'/incidents?environment=LOCAL')).status,401);
 assert.equal((await fetch(base+'/incidents?environment=invalid',{headers})).status,400);
 assert.ok(Array.isArray(await(await fetch(base+'/incidents?environment=LOCAL',{headers})).json()));
 const all=await(await fetch(base+'/monitor?environment=ALL',{headers})).json();assert.deepEqual(all.snapshots.map(e=>e.environment),['LOCAL','STAGING','PRODUCTION']);
 for(const env of ['LOCAL','STAGING','PRODUCTION']){const body=await(await fetch(base+'/monitor?environment='+env,{headers})).json();assert.equal(body.snapshots.length,1);assert.equal(body.snapshots[0].environment,env);}
 const controller=new AbortController();const stream=await fetch(base+'/monitor-stream?environment=ALL&minutes=15',{headers,signal:controller.signal});assert.match(stream.headers.get('content-type'),/event-stream/);const reader=stream.body.getReader();let buffer='';for(let i=0;i<3&&!buffer.includes('data: ');i++){buffer+=new TextDecoder().decode((await reader.read()).value);}assert.match(buffer,/"environment":"ALL"/);assert.match(buffer,/"minutes":15/);controller.abort();
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
