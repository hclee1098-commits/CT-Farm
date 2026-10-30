// 환경·서비스·이벤트를 허용 목록으로 제한합니다. 원문/URL/사용자정보는 저장하지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const environments=['LOCAL','STAGING','PRODUCTION'];
export const services=['api','web','database','redis','mail','backup','deployment','collector','security','disk','disk-database','disk-uploads','disk-backup'];
export const kinds=['request','start','stop','health','mail','backup','deploy','rollback','security','heartbeat','failure'];
export function environment(value){if(!environments.includes(value))throw Error('INVALID_ENVIRONMENT');return value;}
export function safeEvent(input,expected){
 environment(expected);
 if(!input||input.environment!==expected||!services.includes(input.service)||!kinds.includes(input.kind))throw Error('EVENT_SCOPE');
 if(!['info','warn','error'].includes(input.level)||!Number.isFinite(Date.parse(input.time))||Date.parse(input.time)>Date.now()+30000||Date.parse(input.time)<Date.now()-7*86400000)throw Error('EVENT_INVALID');
 const event={id:/^[a-f\d-]{36}$/i.test(input.id||'')?input.id:crypto.randomUUID(),environment:expected,time:input.time,service:input.service,kind:input.kind,level:input.level};
 for(const key of ['status','result'])if(['up','down','unknown','success','failed','started','rolled_back','not_configured'].includes(input[key]))event[key]=input[key];
 if(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(input.method))event.method=input.method;
 if(Number.isInteger(input.statusCode)&&input.statusCode>=100&&input.statusCode<=599)event.statusCode=input.statusCode;
 if(Number.isFinite(input.durationMs)&&input.durationMs>=0&&input.durationMs<=3600000)event.durationMs=input.durationMs;
 if(/^[a-f\d-]{36}$/i.test(input.requestId||''))event.requestId=input.requestId;
 // 버전은 이미지 digest 또는 Git SHA만 허용합니다. 자유 텍스트 비밀정보를 차단합니다.
 if(/^(sha256:)?[a-f\d]{7,64}$/i.test(input.version||''))event.version=input.version;
 for(const key of ['approved','verified'])if(typeof input[key]==='boolean')event[key]=input[key];
 return event;
}
export const limits={maxBytes:8*1024*1024,retentionMs:7*86400000,maxRows:10000};
export function eventFile(dir,env,service){environment(env);if(!services.includes(service))throw Error('SERVICE');return path.join(dir,env,service+'.jsonl');}
export function loadEvents(dir,env,now=Date.now()){
 environment(env);const rows=[];
 for(const source of [...services,'api-runtime','web-runtime','web-http']){const file=(source.endsWith('-runtime')||source==='web-http')?path.join(dir,env,source+'.jsonl'):eventFile(dir,env,source);try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limits.maxBytes+65536)continue;for(const line of fs.readFileSync(file,'utf8').split('\n')){try{const e=safeEvent(JSON.parse(line),env);if((source.endsWith('-runtime')||source==='web-http'||e.service===source)&&Date.parse(e.time)>=now-limits.retentionMs)rows.push(e);}catch{}}}catch{}}
 return rows.sort((a,b)=>a.time.localeCompare(b.time)).slice(-limits.maxRows);
}
export function appendEvents(dir,env,inputs){
 environment(env);if(!Array.isArray(inputs)||inputs.length>200)throw Error('BATCH_LIMIT');
 const events=inputs.map(e=>safeEvent(e,env)); // 전체 검증 후 저장: 환경 혼합 배치는 거부
 for(const service of new Set(events.map(e=>e.service))){
  const file=eventFile(dir,env,service);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('SYMLINK');
  let existing=[];try{if(fs.statSync(file).size<=limits.maxBytes+65536)existing=fs.readFileSync(file,'utf8').split('\n').filter(Boolean).flatMap(l=>{try{return [safeEvent(JSON.parse(l),env)];}catch{return [];}});}catch{}
  const seen=new Set(existing.map(e=>e.id));for(const e of events.filter(e=>e.service===service))if(!seen.has(e.id)){existing.push(e);seen.add(e.id);}
  const cutoff=Date.now()-limits.retentionMs;let lines=existing.filter(e=>Date.parse(e.time)>=cutoff).slice(-limits.maxRows).map(e=>JSON.stringify(e)+'\n');let bytes=Buffer.byteLength(lines.join(''));while(bytes>limits.maxBytes&&lines.length){bytes-=Buffer.byteLength(lines.shift());}
  const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,lines.join(''),{mode:0o600});fs.renameSync(temp,file);
 }
 return events.length;
}
export function summarize(events,env,minutes=60,now=Date.now()){
 environment(env);const all=events.filter(e=>e.environment===env).sort((a,b)=>a.time.localeCompare(b.time));const recent=all.filter(e=>Date.parse(e.time)>=now-minutes*60000);
 const heartbeat=all.filter(e=>e.service==='collector'&&e.kind==='heartbeat').at(-1);const last=all.at(-1);
 const fresh=!!heartbeat&&now-Date.parse(heartbeat.time)<45000;
 const requests=recent.filter(e=>e.kind==='request'&&e.service==='api'&&e.statusCode);const sampled=all.some(e=>e.kind==='start'&&e.service==='api');
 const errors=requests.filter(e=>e.statusCode>=400).length;const latency=requests.filter(e=>Number.isFinite(e.durationMs));
 const states={};for(const service of services.filter(s=>!['deployment','security','collector'].includes(s))){const e=all.filter(e=>e.service===service&&['health','mail','backup','stop','failure'].includes(e.kind)).at(-1);const stale=!e||now-Date.parse(e.time)>(['mail','backup'].includes(service)?86400000:45000);states[service]={status:stale?'unknown':e.status|| (e.result==='success'?'up':e.result==='failed'?'down':'unknown'),lastObserved:e?.time||null,stale};}
 return {environment:env,windowMinutes:minutes,collector:{status:fresh?'connected':heartbeat?'stale':'uncollected',lastSeen:heartbeat?.time||null},lastCollectedAt:last?.time||null,requests:requests.length|| (sampled?0:null),errors:sampled||requests.length?errors:null,errorRate:requests.length?errors/requests.length:null,meanLatency:latency.length?latency.reduce((s,e)=>s+e.durationMs,0)/latency.length:null,services:states,incidents:recent.filter(e=>e.level==='error'||e.status==='down').slice(-20),deployments:all.filter(e=>['deploy','rollback'].includes(e.kind)).slice(-30),deployment:all.filter(e=>e.kind==='deploy'&&e.result==='success').at(-1)||null,observations:all.filter(e=>['start','health','heartbeat','mail','backup','stop'].includes(e.kind)).slice(-100),events:recent,scope:'수집된 이벤트 / 보관 7일·서비스당 8MiB·최대 10000행; 손실 없는 통계 아님'};
}
export function tokenEquals(a,b){if(typeof a!=='string'||typeof b!=='string'||b.length<32)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function httpsURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('HTTPS_REQUIRED');return u;}
