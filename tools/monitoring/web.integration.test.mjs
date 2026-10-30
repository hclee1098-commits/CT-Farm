// 빌드 후 실행: 실제 Next HTTP 서버와 관측 파일을 검증합니다. DB는 사용하지 않습니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {loadEvents} from './core.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('실제 Next 서버: 정상·404 요청 수집, 민감 URL 배제, 안전 종료',async()=>{
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const dir=fs.mkdtempSync(path.join(os.tmpdir(),'secure-web-'));
 const child=spawn(process.execPath,['--require',path.join(root,'tools/monitoring/web-http.cjs'),path.join(root,'node_modules/next/dist/bin/next'),'start','-p',String(port),'-H','127.0.0.1'],{cwd:path.join(root,'apps/web'),env:{...process.env,APP_ENV:'LOCAL',NODE_ENV:'production',MONITOR_DIR:dir},stdio:['ignore','ignore','ignore']});
 try{let ready=false;for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/monitor-health`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);assert.equal((await fetch(`http://127.0.0.1:${port}/does-not-exist?token=secret-never-collect`)).status,404);
 let rows=[];for(let i=0;i<30;i++){rows=loadEvents(dir,'LOCAL');if(rows.filter(e=>e.kind==='request').length>=2)break;await new Promise(r=>setTimeout(r,50));}
 assert.ok(rows.some(e=>e.service==='web'&&e.statusCode===200));assert.ok(rows.some(e=>e.service==='web'&&e.statusCode===404));assert.ok(!JSON.stringify(rows).includes('secret-never-collect'));
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(()=>{child.kill('SIGKILL');r();},3000)).then(()=>{})]);}fs.rmSync(dir,{recursive:true,force:true});}
});
