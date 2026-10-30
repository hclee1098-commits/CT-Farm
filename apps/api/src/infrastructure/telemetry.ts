import "dotenv/config";
// 원문 문자열·경로·사용자 식별자를 받지 않는 허용 목록 이벤트 기록기입니다.
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
type Fields = {statusCode?:number;durationMs?:number;method?:string;requestId?:string;status?:string;result?:string};
const service = 'api';
const environment = process.env.APP_ENV || 'LOCAL';
const allowed = ['LOCAL','STAGING','PRODUCTION'].includes(environment);
const queue: object[] = []; let running=false;let lastPrune=0;
export function telemetry(kind:string,fields:Fields={}) {
 if(!allowed || !['request','start','stop','health','mail','backup','security','failure'].includes(kind))return;
 const event:Record<string,unknown>={id:randomUUID(),time:new Date().toISOString(),environment,service:kind==='mail'?'mail':kind==='security'?'security':service,kind,level:(fields.statusCode||0)>=500||fields.status==='down'||fields.result==='failed'?'error':(fields.statusCode||0)>=400?'warn':'info'};
 if(Number.isInteger(fields.statusCode))event.statusCode=fields.statusCode;
 if(Number.isFinite(fields.durationMs))event.durationMs=fields.durationMs;
 if(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(fields.method||''))event.method=fields.method;
 if(/^[a-f\d-]{36}$/i.test(fields.requestId||''))event.requestId=fields.requestId;
 if(['up','down','unknown','not_configured'].includes(fields.status||''))event.status=fields.status;
 if(['success','failed'].includes(fields.result||''))event.result=fields.result;
 if(/^(sha256:)?[a-f\d]{7,64}$/i.test(process.env.DEPLOY_VERSION||''))event.version=process.env.DEPLOY_VERSION;
 if(queue.length<500)queue.push(event); // 과부하 시 관측 이벤트만 버립니다.
 if(!running){running=true;setImmediate(()=>void flush());}
}
async function flush(){
 try{
  const batch=queue.splice(0,100);const base=process.env.MONITOR_DIR||path.resolve(process.cwd(),'../../.starter-state/monitoring');
  const dir=path.join(base,environment);await fs.mkdir(dir,{recursive:true,mode:0o700});
  // 이메일·보안 이벤트도 API 전용 파일에 기록하여 쓰기 충돌을 피합니다.
  const target=path.join(dir,service+'-runtime.jsonl');
  try{const stat=await fs.lstat(target);if(stat.isSymbolicLink())return;if(stat.size>8*1024*1024)await fs.writeFile(target,'',{mode:0o600});}catch{}
  if(Date.now()-lastPrune>60000){lastPrune=Date.now();try{const rows=(await fs.readFile(target,'utf8')).split('\n').filter(Boolean).filter(line=>{try{return Date.parse(JSON.parse(line).time)>=Date.now()-7*86400000;}catch{return false;}});await fs.writeFile(target,rows.length?rows.join('\n')+'\n':'',{mode:0o600});}catch{}}
  await fs.appendFile(target,batch.map(e=>JSON.stringify(e)).join('\n')+'\n',{mode:0o600});
 }catch{ /* 관측 장애로 서비스 요청을 실패시키지 않습니다. */ }
 finally{running=false;if(queue.length){running=true;setImmediate(()=>void flush());}}
}
