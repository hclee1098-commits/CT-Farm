// DB/API 장애 중에도 동작하는 로컬 사건 이력. 외부 발송은 기본 비활성입니다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {environment,safeEvent} from './core.mjs';
import {withStateLock} from './state-lock.mjs';
function location(dir,env){environment(env);const folder=path.resolve(dir,env);fs.mkdirSync(folder,{recursive:true,mode:0o700});const target=path.join(folder,'incidents.json');if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('INCIDENT_LINK');return target;}
export function readIncidents(dir,env){const file=location(dir,env);if(!fs.existsSync(file))return {incidents:[],seen:[],outbox:[]};if(fs.statSync(file).size>2*1024*1024)throw Error('INCIDENT_LIMIT');return JSON.parse(fs.readFileSync(file,'utf8'));}
function save(dir,env,state){const file=location(dir,env),tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,file);}
export function processIncidents(dir,env,raw,{testDelivery=false}={}){
 return withIncidentState(dir,env,state=>{
 const known=new Set(state.seen);const transitions=[];
 for(const rawEvent of raw.slice(-5000).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time))){
  let e;try{e=safeEvent(rawEvent,env);}catch{continue;}if(known.has(e.id))continue;known.add(e.id);
  const failure=e.kind==='health'&&e.status==='down'||['backup','deploy'].includes(e.kind)&&e.result==='failed';
  const recovery=e.kind==='health'&&e.status==='up'||['backup','deploy'].includes(e.kind)&&e.result==='success';
  if(!failure&&!recovery)continue;
  const open=state.incidents.find(i=>i.service===e.service&&!i.resolvedAt);
  if(failure&&!open){const item={id:crypto.randomUUID(),environment:env,service:e.service,openedAt:e.time,lastSeenAt:e.time,resolvedAt:null,acknowledgedAt:null,delivery:testDelivery?'TEST_ONLY':'NOT_CONFIGURED'};state.incidents.unshift(item);transitions.push({incidentId:item.id,service:item.service,transition:'OPEN',time:e.time});}
  else if(failure&&open)open.lastSeenAt=e.time;
  else if(recovery&&open){open.resolvedAt=e.time;transitions.push({incidentId:open.id,service:open.service,transition:'RECOVERED',time:e.time});}
 }
 state.seen=[...known].slice(-10000);state.incidents=state.incidents.slice(0,300);
 // 시험 발송 기록은 실제 수신 성공으로 표시하지 않습니다. 주소·본문·비밀키를 저장하지 않습니다.
 if(testDelivery)state.outbox.push(...transitions.map(t=>({...t,mode:'TEST_ONLY'})));state.outbox=state.outbox.slice(-300);return {incidents:state.incidents,transitions};
 });
}
export function withIncidentState(dir,env,change){const file=location(dir,env);return withStateLock(file,()=>{const state=readIncidents(dir,env);const result=change(state);save(dir,env,state);return result;});}
export function acknowledgeIncident(dir,env,id){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('INCIDENT_ID');return withIncidentState(dir,env,state=>{const item=state.incidents.find(i=>i.id===id);if(!item)throw Error('INCIDENT_NOT_FOUND');item.acknowledgedAt??=new Date().toISOString();});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [action,id]=process.argv.slice(2),dir=process.env.MONITOR_DIR||path.resolve('.starter-state/monitoring'),env=process.env.APP_ENV||'LOCAL';
 if(action==='ack')acknowledgeIncident(dir,env,id);else if(action==='list')console.log(JSON.stringify(readIncidents(dir,env).incidents));else throw Error('사용법: incidents.mjs list | ack <사건 UUID>');
}
