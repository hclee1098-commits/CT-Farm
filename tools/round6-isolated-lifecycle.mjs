import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function isolatedLifecycle(env){
 const root=process.cwd(),dir=path.join(root,'verification/runtime/round6-lifecycle-'+randomBytes(6).toString('hex'));await fs.mkdir(path.join(dir,'apps'),{recursive:true});
 for(const app of ['api','web']){await fs.mkdir(path.join(dir,'apps',app));await fs.cp('apps/'+app+'/src',path.join(dir,'apps',app,'src'),{recursive:true});await fs.copyFile('apps/'+app+'/package.json',path.join(dir,'apps',app,'package.json'));}
 for(const file of ['tsconfig.json','next.config.ts','next-env.d.ts'])await fs.copyFile('apps/web/'+file,path.join(dir,'apps/web',file));await fs.cp('apps/web/public',path.join(dir,'apps/web/public'),{recursive:true});await fs.mkdir(path.join(dir,'tools'),{recursive:true});await fs.cp('tools/monitoring',path.join(dir,'tools/monitoring'),{recursive:true});await fs.copyFile('package.json',path.join(dir,'package.json'));await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'junction');
 async function port(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const n=server.address().port;await new Promise(r=>server.close(r));return n;}
 const api=await port(),web=await port();await fs.writeFile(path.join(dir,'apps/web/.env.local'),`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:${api}/api/v1\n`);
 const systemKeys=['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','ComSpec','PROCESSOR_ARCHITECTURE'];
 const childEnv=Object.fromEntries(systemKeys.filter(k=>env[k]!==undefined).map(k=>[k,env[k]]));Object.assign(childEnv,{NODE_ENV:'development',APP_ENV:'LOCAL',DATABASE_URL:env.DATABASE_URL,REDIS_URL:env.REDIS_URL,JWT_ACCESS_SECRET:env.JWT_ACCESS_SECRET,MFA_ENCRYPTION_KEY:env.MFA_ENCRYPTION_KEY,CORS_ORIGINS:`http://127.0.0.1:${web}`,WEATHER_MODE:'DISABLED',FARM_ASSISTANT_ENABLED:'false',LOG_LEVEL:'fatal',UPLOAD_DIR:path.join(dir,'uploads'),MONITOR_DIR:path.join(dir,'monitor')});
 const startedAt=new Date().toISOString();let r,code=0;try{r=await exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','tools/test-isolated-lifecycle.ps1','-TestRoot',dir,'-ApiPort',String(api),'-WebPort',String(web)],{env:childEnv,windowsHide:true,timeout:240000,maxBuffer:2*1024*1024});}catch(e){r=e;code=typeof e.code==='number'?e.code:1;}
 const evidence='verification/round6/isolated-lifecycle-'+path.basename(dir)+'.log';await fs.writeFile(evidence,JSON.stringify({command:'powershell.exe -File tools/test-isolated-lifecycle.ps1 (isolated path and random ports)',startedAt,endedAt:new Date().toISOString(),exitCode:code,stdout:r.stdout,stderr:r.stderr},null,2));if(code)throw Error('ISOLATED_LIFECYCLE_FAILED; '+evidence);return {exitCode:code,evidence,originalPortsUsed:false,originalDockerTouched:false};
}
