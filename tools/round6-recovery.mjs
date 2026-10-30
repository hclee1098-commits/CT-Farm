import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {encryptBackup,decryptBackup} from './backup.mjs';
import sharp from 'sharp';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
export async function recoverSynthetic({pgId,database,env,ownerToken,otherToken,fileId,fileHash,uploads,ownerEmail,password,farmId}){
 assert.match(database,/^ct_farm_verify_[a-f0-9]{12}$/);const label=await exec('docker',['inspect','--format','{{index .Config.Labels "ct-farm.round6"}}',pgId],{windowsHide:true});assert.equal(label.stdout.trim(),database.slice(-12));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ctfarm-round6-restore-'));let child;
 try{
 const archive=path.join(dir,'archive'),vault=path.join(dir,'key-vault'),restored=path.join(dir,'uploads');for(const p of [archive,vault,restored])await fs.mkdir(p,{mode:0o700});
 const files=[];let total=0;for(const name of (await fs.readdir(uploads)).filter(n=>!n.startsWith('.'))){const p=path.join(uploads,name),s=await fs.lstat(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1);total+=s.size;assert(total<=16*1024*1024);const bytes=await fs.readFile(p);files.push({name,data:bytes.toString('base64'),sha256:hash(bytes)});}
 const dump=await exec('docker',['exec',pgId,'pg_dump','-U','round6','-d',database,'--format=custom','--no-owner','--no-privileges'],{encoding:'buffer',maxBuffer:16*1024*1024,windowsHide:true});const capturedAt=new Date().toISOString(),key=randomBytes(32);const encrypted=encryptBackup({version:1,project:'ctfarm-round6',database:{data:dump.stdout.toString('base64'),sha256:hash(dump.stdout)},files},key);await fs.writeFile(path.join(archive,'snapshot.ssbk'),encrypted,{mode:0o600,flag:'wx'});await fs.writeFile(path.join(vault,'key'),key,{mode:0o600,flag:'wx'});
 const started=performance.now(),payload=decryptBackup(await fs.readFile(path.join(archive,'snapshot.ssbk')),await fs.readFile(path.join(vault,'key'))),restoreDb='ct_farm_verify_'+randomBytes(6).toString('hex');await exec('docker',['exec',pgId,'createdb','-U','round6',restoreDb],{windowsHide:true});
 await new Promise((resolve,reject)=>{const restore=spawn('docker',['exec','-i',pgId,'pg_restore','-U','round6','-d',restoreDb,'--no-owner','--no-privileges'],{windowsHide:true,stdio:['pipe','ignore','ignore']});restore.on('error',reject);restore.on('close',c=>c===0?resolve():reject(Error('SYNTHETIC_RESTORE_FAILED')));restore.stdin.end(Buffer.from(payload.database.data,'base64'));});
 for(const file of payload.files){await fs.writeFile(path.join(restored,file.name),Buffer.from(file.data,'base64'),{flag:'wx',mode:0o600});assert.equal(hash(await fs.readFile(path.join(restored,file.name))),file.sha256);}
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const url=new URL(env.DATABASE_URL);url.pathname='/'+restoreDb;
 child=spawn(process.execPath,['--import','tsx','src/bootstrap/server.ts'],{cwd:path.resolve('apps/api'),env:{...env,DATABASE_URL:url.toString(),UPLOAD_DIR:restored,PORT:String(port),MONITOR_DIR:path.join(dir,'monitor')},windowsHide:true,stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health/ready',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'RESTORED_API_READY');
 const fileResponse=await fetch(base+`/api/v1/files/${fileId}/download`,{headers:{Authorization:'Bearer '+ownerToken}});assert.equal(fileResponse.status,200);assert.equal(hash(Buffer.from(await fileResponse.arrayBuffer())),fileHash);assert.equal((await fetch(base+`/api/v1/files/${fileId}/download`,{headers:{Authorization:'Bearer '+otherToken}})).status,404);
 const recovery={capturedAt,restoreMilliseconds:performance.now()-started,files:files.length,bytes:total,fileHashVerified:true,metadataAndAuthenticatedDownloadVerified:true,outsiderStatus:404,sourceDatabaseTouched:false,offsite:false,productionRtoRpoMeasured:false};
 const metrics=[];
 async function load(name,count,concurrency,request){const latencies=[];let errors=0;for(let start=0;start<count;start+=concurrency)await Promise.all(Array.from({length:Math.min(concurrency,count-start)},async()=>{const t=performance.now();try{const r=await request();await r.arrayBuffer();if(!r.ok)errors++;}catch{errors++;}latencies.push(performance.now()-t);}));latencies.sort((a,b)=>a-b);metrics.push({name,count,concurrency,errors,quantileMethod:'nearest-rank',p50Ms:latencies[Math.ceil(count*.5)-1],p95Ms:latencies[Math.ceil(count*.95)-1]});assert.equal(errors,0,name+' load errors');}
 const auth={Authorization:'Bearer '+ownerToken};
 await load('login',4,2,()=>fetch(base+'/api/v1/auth/mobile/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:ownerEmail,password}),signal:AbortSignal.timeout(10000)}));
 await load('dashboard',8,4,()=>fetch(base+'/api/v1/workspace/dashboard',{headers:auth,signal:AbortSignal.timeout(10000)}));
 await load('sensors',4,2,()=>fetch(base+`/api/v1/farms/${farmId}/sensors`,{headers:auth,signal:AbortSignal.timeout(10000)}));
 const sample=await sharp({create:{width:32,height:32,channels:3,background:'blue'}}).png().toBuffer();
 await load('photo-upload',2,1,()=>{const form=new FormData();form.set('file',new Blob([sample],{type:'image/png'}),'synthetic.png');return fetch(base+'/api/v1/files',{method:'POST',headers:auth,body:form,signal:AbortSignal.timeout(10000)});});
 const memory=await exec('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${child.pid}).WorkingSet64`],{windowsHide:true});const connections=await exec('docker',['exec',pgId,'psql','-U','round6','-d',restoreDb,'-t','-A','-c','SELECT COUNT(*) FROM pg_stat_activity WHERE datname=current_database();'],{windowsHide:true});
 return {recovery,load:{metrics,apiProcessPid:child.pid,apiProcessWorkingSetBytes:Number(memory.stdout.trim()),apiIsSeparateFromHarness:true,databaseConnectionsAtSample:Number(connections.stdout.trim()),connectionLimit:5,cpuCount:os.cpus().length,hostRamBytes:os.totalmem(),postgresMemoryLimitMiB:512,postgresCpuLimit:1,scope:'short isolated run, not sustained capacity or production SLA'}};
 }finally{if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'ctfarm-round6-restore-'));await fs.rm(dir,{recursive:true,force:true});}
}
