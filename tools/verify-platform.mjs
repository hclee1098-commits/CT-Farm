import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const tasks=[['clean-install',['ci','--ignore-scripts']],['prisma-generate',['run','db:generate']],['source',['run','check:source']],['unit',['test']],['portal',['run','test:portal']],['smtp',['run','test:smtp']],['sql',['run','test:sql']],['backup',['run','test:backup']],['preview',['run','predev:portal']],['build',['run','build']],['web-http',['run','test:smoke']],['audit',['audit','--json']]];const results=[];
for(const [name,args]of tasks){const start=Date.now();const result=await new Promise(resolve=>{const child=spawn('npm',args,{cwd,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());const timer=setTimeout(()=>child.kill('SIGTERM'),120000);child.on('close',code=>{clearTimeout(timer);resolve({name,command:'npm '+args.join(' '),status:code===0?'성공':'실패',exitCode:code,durationMs:Date.now()-start,output:output.replace(/\x1b\[[0-9;]*m/g,'').slice(-18000)});});});results.push(result);fs.mkdirSync(path.join(cwd,'analysis'),{recursive:true});fs.writeFileSync(path.join(cwd,'analysis/current-verification.json'),JSON.stringify({at:new Date().toISOString(),runtime:process.version,results},null,2));console.log(name+': '+result.status);}

process.exitCode=results.some(r=>r.status!=='성공')?1:0;
