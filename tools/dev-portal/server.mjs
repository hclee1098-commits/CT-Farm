import {snapshots} from '../monitoring/portal-source.mjs';
import {readIncidents} from '../monitoring/incidents.mjs';
import {readEvents} from './events.mjs';
// 운영 빌드에 포함하지 않는 독립 로컬 개발 도구. 임의 파일/명령/SQL API 없음.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {analyze,root} from '../analyze-project.mjs';
export function createPortal({token=process.env.DEV_PORTAL_TOKEN,port=4310}={}){
 if(process.env.NODE_ENV==='production')throw Error('운영환경에서는 개발 도구를 실행할 수 없습니다.');
 if(!token||token.length<32)throw Error('DEV_PORTAL_TOKEN에 32자 이상의 별도 접근키가 필요합니다.');
 const expires=Date.now()+60*60*1000;const expected=Buffer.from(token);let attempts=new Map();let active=0;
 const assets=new Map(['index.html','app.js','style.css','monitor-view.js'].map(n=>['/'+(n==='index.html'?'':n),fs.readFileSync(new URL(n,import.meta.url))]));
 const preview=path.join(root,'.starter-state/component-preview.js');
 const previewCss=path.join(root,'.starter-state/component-preview.css');
 if(fs.existsSync(preview))assets.set('/component-preview.js',fs.readFileSync(preview));
 if(fs.existsSync(previewCss))assets.set('/component-preview.css',fs.readFileSync(previewCss));
 const docsBundle=path.join(root,'.starter-state/docs-view.js');
 if(fs.existsSync(docsBundle))assets.set('/docs-view.js',fs.readFileSync(docsBundle));
 const data=analyze();
 const documents=data.files.filter(f=>f.path.startsWith('docs/')&&f.type==='.md').map(f=>({path:f.path,title:fs.readFileSync(path.join(root,f.path),'utf8').match(/^# (.+)$/m)?.[1]||f.path,description:fs.readFileSync(path.join(root,f.path),'utf8').match(/알 수 있는 것:\*\* (.+)/)?.[1]||'상세 안내',modified:fs.statSync(path.join(root,f.path)).mtime.toISOString(),status:f.path.includes('/08-')?'과거 이력':f.path.includes('/09-')?'현재 CT-Farm 안내':'기존 상세 참고 · 검증일 확인',text:fs.readFileSync(path.join(root,f.path),'utf8')})).sort((a,b)=>{const rank=p=>p==='docs/README.md'?0:p.includes('/09-')?1:p.includes('/08-')?3:2;return rank(a.path)-rank(b.path)||a.path.localeCompare(b.path,'ko');});
 const server=http.createServer(async(req,res)=>{
  const host=`127.0.0.1:${server.address().port}`;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==`http://${host}`)||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403).end();return;}
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(assets.has(req.url)){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(assets.get(req.url));return;}
  const now=Date.now();if(attempts.size>1000)attempts.clear();const key=req.socket.remoteAddress;let rate=attempts.get(key);if(!rate||now-rate.start>60000)attempts.set(key,rate={start:now,count:0});if(++rate.count>120){res.writeHead(429).end();return;}
  const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));
  if(now>expires||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){res.writeHead(401).end();return;}
  // 감사 이벤트는 경로·성공 여부만, 인증키는 기록하지 않습니다.
  console.info(JSON.stringify({event:'DEV_PORTAL_READ',path:req.url.split('?')[0],at:new Date().toISOString()}));
  if(req.url==='/documents'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(documents));return;}
  if(req.url==='/metadata'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
  const monitorURL=new URL(req.url,`http://${host}`);
  if(monitorURL.pathname==='/incidents'){
   const env=monitorURL.searchParams.get('environment')||'LOCAL';if(!['LOCAL','STAGING','PRODUCTION'].includes(env)){res.writeHead(400).end();return;}
   res.setHeader('Content-Type','application/json');try{res.end(JSON.stringify(readIncidents(process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),env).incidents));}catch{res.writeHead(503).end(JSON.stringify({error:'INCIDENT_STORAGE_UNAVAILABLE'}));}return;
  }
  if(['/monitor','/monitor-stream'].includes(monitorURL.pathname)){
   const env=monitorURL.searchParams.get('environment')||'LOCAL';
   const minutes=Math.min(1440,Math.max(1,Number(monitorURL.searchParams.get('minutes'))||60));
   if(!['LOCAL','STAGING','PRODUCTION','ALL'].includes(env)){res.writeHead(400).end();return;}
   const get=async()=>({environment:env,minutes,snapshots:await snapshots({env,minutes})});
   if(monitorURL.pathname==='/monitor'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await get()));return;}
   if(active>=3){res.writeHead(429).end();return;}active++;
   res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('retry: 5000\n\n');
   let busy=false,closed=false;const tick=async()=>{if(busy||closed)return;busy=true;try{const payload=await get();if(!closed){if(res.writableLength>262144)res.destroy();else res.write('data: '+JSON.stringify(payload)+'\n\n');}}catch{res.end();}finally{busy=false;}};
   const timer=setInterval(tick,5000);const end=setTimeout(()=>res.end(),Math.max(0,expires-Date.now()));
   res.on('close',()=>{closed=true;clearInterval(timer);clearTimeout(end);active--;});void tick();return;
  }
  if(req.url==='/events'){
   if(active>=3){res.writeHead(429).end();return;}active++;res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('retry: 3000\n\n');
   let seen=new Set();
   const timer=setInterval(()=>{if(res.writableLength>65536){res.destroy();return;}for(const event of readEvents()){const key=JSON.stringify(event);if(!seen.has(key)){res.write('data: '+key+'\n\n');}}seen=new Set(readEvents().map(e=>JSON.stringify(e)));res.write('data: '+JSON.stringify({time:new Date().toISOString(),service:'portal',level:'info',message:'개발자 포털 연결 유지',api:'수집되지 않음',web:'수집되지 않음',database:'수집되지 않음',redis:'수집되지 않음'})+'\n\n');},2000);
   const end=setTimeout(()=>res.end(),Math.max(0,expires-Date.now()));req.on('close',()=>{clearInterval(timer);clearTimeout(end);active--;});return;
  }
  res.writeHead(404).end();
 });server.headersTimeout=10000;server.requestTimeout=15000;return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createPortal();server.listen(4310,'127.0.0.1',()=>console.log('개발자 포털: http://127.0.0.1:4310 · 접근키 유효시간 1시간'));}
