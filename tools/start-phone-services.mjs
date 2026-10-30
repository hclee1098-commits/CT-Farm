// USB 시험용 API/Metro만 시작합니다. 원본 3000/4000과 기존 Docker 리소스는 제어하지 않습니다.
import fs from 'node:fs/promises';import path from 'node:path';import {openSync,closeSync} from 'node:fs';import {spawn} from 'node:child_process';import {createConnection} from 'node:net';
const root=process.cwd(),state=path.join(root,'.starter-state/phone-test'),app=path.join(state,'app');
const owner=JSON.parse(await fs.readFile(path.join(state,'app-owner.json'),'utf8'));if(owner.root!==root||owner.app!==app)throw Error('APP_OWNER');
async function tcp(port){return new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.setTimeout(1000,()=>{s.destroy();resolve(false);});});}
if(await tcp(18081))throw Error('18081 포트가 이미 사용 중입니다. 기존 프로세스를 인수하거나 종료하지 않습니다.');
try{const q=JSON.parse(await fs.readFile(path.join(state,'qa.json'),'utf8'));const u=new URL(q.apiBase);if(await tcp(Number(u.port)))throw Error('기존 시험 API가 실행 중입니다. 먼저 상태를 확인하세요.');}catch(e){if(e.code!=='ENOENT')throw e;}
const report={startedAt:new Date().toISOString(),projectRoot:root,appRoot:app,processes:[],originalServersControlled:false};
function launch(name,args,cwd,extra={}){const log=path.join(state,name+'.log'),fd=openSync(log,'a');const env={...process.env,CI:'1',EXPO_NO_TELEMETRY:'1',EXPO_NO_DOTENV:'1',EXPO_PUBLIC_API_URL:'http://127.0.0.1:4084/api/v1',...extra};for(const k of Object.keys(env))if(/^(DATABASE_URL|REDIS_URL|SMTP_|MAIL_|MONITOR_|UPLOAD_DIR)/.test(k))delete env[k];try{const c=spawn(process.execPath,args,{cwd,env,detached:true,windowsHide:true,stdio:['ignore',fd,fd]});c.unref();report.processes.push({name,pid:c.pid,startedAt:new Date().toISOString(),executable:process.execPath,args,log:path.relative(root,log)});return c;}finally{closeSync(fd);}}
const qa=launch('phone-api',['--import','tsx',path.join(root,'tools/test-mobile-api.mts'),'--hold-phone-qa'],root);await fs.writeFile(path.join(state,'services.json'),JSON.stringify(report,null,2));
try{
 let ready=false;
 for(let i=0;i<240;i++){if(qa.exitCode!==null)throw Error('시험 API가 종료됐습니다. phone-api.log를 확인하세요.');try{const q=JSON.parse(await fs.readFile(path.join(state,'qa.json'),'utf8'));if(q.pid===qa.pid&&(await fetch(new URL('/health/ready',q.apiBase),{signal:AbortSignal.timeout(1500)})).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('시험 API 준비 제한 초과. 원본 서버는 변경하지 않았습니다.');
 const metro=launch('phone-metro',[path.join(app,'node_modules/expo/bin/cli'),'start','--dev-client','--localhost','--port','18081'],app);
 ready=false;for(let i=0;i<120;i++){if(metro.exitCode!==null)throw Error('Metro가 종료됐습니다. phone-metro.log를 확인하세요.');try{const r=await fetch('http://127.0.0.1:18081/status',{signal:AbortSignal.timeout(1500)});if(r.ok&&(await r.text()).includes('packager-status:running')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('Metro 준비 제한 초과');report.status='ready';report.phoneApiPort=4084;report.metroPort=18081;report.qaExpiresAfterHours=2;console.log('USB 시험 API와 localhost Metro 준비 완료');
}catch(e){report.status='failed';report.error=e.message;console.error(e.message);process.exitCode=1;}finally{report.endedAt=new Date().toISOString();await fs.writeFile(path.join(state,'services.json'),JSON.stringify(report,null,2));await fs.mkdir('verification/ui-mobile/phone-services',{recursive:true});await fs.writeFile('verification/ui-mobile/phone-services/results.json',JSON.stringify(report,null,2));}
