import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const root=process.cwd();let uploads;
try{const dir=path.join(root,'apps/api/uploads'),records=[];for(const name of (await fs.readdir(dir)).sort()){const file=path.join(dir,name),s=await fs.lstat(file);if(s.isFile()&&!s.isSymbolicLink())records.push({name,size:s.size,sha256:hash(await fs.readFile(file))});}uploads={files:records.length,aggregateSha256:hash(JSON.stringify(records)),namesAndContentsDisclosed:false};}catch{uploads={status:'unavailable'};}
const services=[];for(const port of [3000,4000]){try{const r=await fetch(`http://127.0.0.1:${port}/${port===4000?'health/ready':'starter'}`,{signal:AbortSignal.timeout(2000)});services.push({port,status:r.status});}catch(e){services.push({port,status:'unreachable',code:e.cause?.code||e.name});}}
let docker;try{const r=await exec('docker',['ps','--format','{{.ID}}'],{timeout:5000,windowsHide:true});docker={available:true,runningIds:r.stdout.trim().split(/\s+/).filter(Boolean)};}catch{docker={available:false,reason:'Docker engine unavailable; no start/stop attempted'};}
const result={at:new Date().toISOString(),uploads,services,docker,originalDatabaseAccessed:false,originalDatabaseMigrated:false,servicesStartedOrStopped:false,containersOrVolumesDeleted:false};
const name=process.argv[2];if(!['before','after'].includes(name))throw Error('before|after');await fs.mkdir('verification/round5',{recursive:true});await fs.writeFile(`verification/round5/preservation-${name}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
