// 중앙 수집 서버. TLS 직접 종료만 허용하며 환경별 쓰기/읽기 키를 분리합니다.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {environments,tokenEquals,appendEvents,loadEvents,summarize} from './core.mjs';
export function hubHandler({dir,keys}){
 const values=Object.values(keys).flatMap(k=>[k.read,k.write]);if(values.length!==6||values.some(k=>typeof k!=='string'||k.length<32)||new Set(values).size!==6)throw Error('UNIQUE_KEYS_REQUIRED');
 const rates=new Map();
 return async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');const reply=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify(body));};
  if(!req.socket.encrypted)return reply(403,{error:'TLS_REQUIRED'});
  const url=new URL(req.url,'https://monitor.invalid');const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');let env,role;
  for(const name of environments)for(const candidate of ['read','write'])if(tokenEquals(supplied,keys[name][candidate])){env=name;role=candidate;}
  if(!env)return reply(401,{error:'UNAUTHORIZED'});
  const now=Date.now();let rate=rates.get(env+role);if(!rate||now-rate.time>60000)rates.set(env+role,rate={time:now,count:0});if(++rate.count>120)return reply(429,{error:'RATE_LIMIT'});
  try{
   if(req.method==='POST'&&url.pathname==='/v1/events'&&role==='write'){
    let size=0,chunks=[];for await(const b of req){size+=b.length;if(size>262144){reply(413,{error:'SIZE'});req.destroy();return;}chunks.push(b);}
    const body=JSON.parse(Buffer.concat(chunks));if(body.environment!==env)return reply(403,{error:'ENVIRONMENT_MISMATCH'});const count=appendEvents(dir,env,body.events);return reply(202,{accepted:count});
   }
   if(req.method==='GET'&&url.pathname==='/v1/snapshot'&&role==='read'){
    if(url.searchParams.get('environment')!==env)return reply(403,{error:'ENVIRONMENT_MISMATCH'});return reply(200,summarize(loadEvents(dir,env),env,Math.min(1440,Math.max(1,Number(url.searchParams.get('minutes'))||60))));
   }
   return reply(403,{error:'ROLE_DENIED'});
  }catch{return reply(400,{error:'INVALID_REQUEST'});}
 };
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const keys=Object.fromEntries(environments.map(env=>[env,{read:process.env['MONITOR_'+env+'_READ_TOKEN'],write:process.env['MONITOR_'+env+'_WRITE_TOKEN']}]));
 const server=https.createServer({key:fs.readFileSync(process.env.MONITOR_TLS_KEY),cert:fs.readFileSync(process.env.MONITOR_TLS_CERT),minVersion:'TLSv1.2'},hubHandler({dir:process.env.MONITOR_DIR||path.resolve('.starter-state/hub'),keys}));
 server.requestTimeout=10000;server.headersTimeout=10000;server.listen(Number(process.env.MONITOR_PORT||9443),process.env.MONITOR_BIND||'127.0.0.1',()=>console.info('모니터링 TLS 수집 서버 시작'));
}
