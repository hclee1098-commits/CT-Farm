// 원본 Next 서버와 .next를 공유하지 않는 합성 QA 웹 복사본입니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=process.cwd(),id=randomBytes(6).toString('hex'),dir=path.join(root,'verification/runtime/round6-web-'+id);
const qa=JSON.parse(await fs.readFile('.starter-state/round6-qa.json','utf8'));const api=new URL(qa.api);if(api.hostname!=='127.0.0.1'||api.port==='4000')throw Error('ISOLATED_API_REQUIRED');
await fs.mkdir(dir,{recursive:true});for(const name of ['src','public'])await fs.cp('apps/web/'+name,path.join(dir,name),{recursive:true});for(const name of ['package.json','tsconfig.json','next-env.d.ts','next.config.ts'])await fs.copyFile('apps/web/'+name,path.join(dir,name));await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'junction');await fs.writeFile(path.join(dir,'.env.local'),'NEXT_PUBLIC_API_BASE_URL='+qa.api+'\n');
const stop=path.join(dir,'qa.stop'),child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev',dir,'-p','3016','-H','127.0.0.1'],{cwd:dir,windowsHide:true,stdio:'ignore'});
await fs.writeFile('.starter-state/round6-web-qa.json',JSON.stringify({id,dir,pid:child.pid,stop,url:'http://127.0.0.1:3016/starter'}));
try{let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3016/starter',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('QA_WEB_NOT_READY');console.log('격리 웹 QA 준비 완료');for(;;){try{await fs.readFile(stop);break;}catch{await new Promise(r=>setTimeout(r,1000));}}}
finally{if(child.exitCode===null){const meta=await exec('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}').CommandLine`],{windowsHide:true});if(!meta.stdout.includes(dir))throw Error('QA_PROCESS_OWNERSHIP');await exec('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});}}
