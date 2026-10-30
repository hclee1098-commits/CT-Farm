// 독립 프로세스: 장애가 API/WEB 실행 경로로 전파되지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {environment,appendEvents,loadEvents,httpsURL} from './core.mjs';
import {processIncidents} from './incidents.mjs';
import {probeDisks} from './disks.mjs';
export function diskState(available,minimum=256*1024*1024){return !Number.isFinite(available)||!Number.isFinite(minimum)||minimum<0?'unknown':available<minimum?'down':'up';}
const root=fileURLToPath(new URL('../../',import.meta.url));
export function settings(source=process.env){if(source.NODE_ENV==='production'&&!source.APP_ENV)throw Error('APP_ENV_REQUIRED');const env=environment(source.APP_ENV||'LOCAL');if(env!=='LOCAL'&&source.NODE_ENV!=='production')throw Error('REMOTE_NODE_ENV');return {env,dir:source.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),api:source.MONITOR_API_URL||'http://127.0.0.1:4000',web:source.MONITOR_WEB_URL||'http://127.0.0.1:3000',remote:source.MONITOR_INGEST_URL,token:source.MONITOR_WRITE_TOKEN};}
export async function collectOnce(config){
 const now=new Date().toISOString(),events=[];const event=(service,status,kind='health')=>events.push({id:crypto.randomUUID(),time:now,environment:config.env,service,kind,level:status==='down'?'error':'info',status});
 const probe=async(url)=>{try{return await fetch(url,{signal:AbortSignal.timeout(3500),redirect:'error'});}catch{return null;}};
 const [api,web]=await Promise.all([probe(config.api+'/health/ready'),probe(config.web+'/api/monitor-health')]);
 event('api',api?.ok?'up':'down');event('web',web?.ok?'up':'down');
 let dependencies;try{dependencies=(await api.json()).data;}catch{}
 for(const service of ['database','redis'])event(service,dependencies?.[service]==='ready'?'up':dependencies?.[service]==='down'?'down':'unknown');
 try{fs.mkdirSync(config.dir,{recursive:true,mode:0o700});const disk=fs.statfsSync(config.dir);event('disk',diskState(disk.bavail*disk.bsize,config.minFreeBytes??256*1024*1024));}catch{event('disk','unknown');}
 for(const disk of probeDisks(config.disks??{database:process.env.MONITOR_DISK_DATABASE_PATH,uploads:process.env.MONITOR_DISK_UPLOADS_PATH,backup:process.env.MONITOR_DISK_BACKUP_PATH},config.minFreeBytes))event(disk.service,disk.status);
 event('collector','up','heartbeat');appendEvents(config.dir,config.env,events);
 // 사건 저장소 실패는 원래 관측 수집/원격 전송을 중단시키지 않습니다.
 try{processIncidents(config.dir,config.env,loadEvents(config.dir,config.env),{testDelivery:process.env.MONITOR_ALERT_MODE==='TEST'});}catch{console.error('사건 이력 저장 실패: 관측 수집은 계속합니다.');}
 // 재전송 시 ID로 중복 제거하며, 전송 실패 시에도 로컬 기록은 유지합니다.
 if(config.remote){
  const remote=httpsURL(config.remote);if(!config.token||config.token.length<32)throw Error('WRITE_TOKEN');
  const pendingFile=path.join(config.dir,config.env,'forward-cursor.json');let cursor={ids:[]};try{cursor=JSON.parse(fs.readFileSync(pendingFile,'utf8'));}catch{}
  const known=new Set(cursor.ids);const available=loadEvents(config.dir,config.env).filter(e=>!known.has(e.id));const priority=events.filter(e=>!known.has(e.id));const urgent=new Set(priority.map(e=>e.id));const pending=[...priority,...available.filter(e=>!urgent.has(e.id)).slice(0,200-priority.length)];
  if(pending.length){const response=await fetch(new URL('/v1/events',remote),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({environment:config.env,events:pending}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('FORWARD_FAILED');for(const e of pending)known.add(e.id);fs.writeFileSync(pendingFile,JSON.stringify({ids:[...known].slice(-10000)}),{mode:0o600});}
 }
 return events;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const local=process.argv.includes('--local');const arg=name=>process.argv[process.argv.indexOf(name)+1];
 const config=local?settings({APP_ENV:'LOCAL',MONITOR_DIR:path.join(root,'.starter-state/monitoring'),MONITOR_API_URL:'http://127.0.0.1:'+Number(arg('--api-port')),MONITOR_WEB_URL:'http://127.0.0.1:'+Number(arg('--web-port'))}):settings();let busy=false,stopped=false;const tick=async()=>{if(busy||stopped)return;busy=true;try{await collectOnce(config);}catch{console.error('수집/전송 실패: 다음 주기에 재시도합니다. 비밀정보 출력 없음.');}finally{busy=false;}};
 await tick();const timer=setInterval(tick,10000);
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopped=true;clearInterval(timer);});
}
