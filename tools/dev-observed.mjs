import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {root} from './analyze-project.mjs';
import {safeEvent} from './developer-event.mjs';
if(process.env.NODE_ENV==='production')throw Error('운영환경에서는 개발 관측 도구를 실행하지 않습니다.');
const service=process.argv[2];if(!['api','web'].includes(service))throw Error('api 또는 web을 선택하세요.');
const target=path.join(root,'apps',service,'.starter-state/developer-events.jsonl');
function record(input){try{fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});if(fs.existsSync(target)&&fs.statSync(target).size>1048576)fs.truncateSync(target,0);fs.appendFileSync(target,JSON.stringify(safeEvent(service,input))+'\n',{mode:0o600});}catch{}}
const npm=process.env.npm_execpath;if(!npm||!fs.existsSync(npm))throw Error('npm run dev:api:observed 또는 dev:web:observed로 실행하세요.');
const child=spawn(process.execPath,[npm,'run','dev','-w',`@starter/${service}`],{cwd:root,stdio:['inherit','pipe','pipe'],env:{...process.env,NODE_ENV:'development'}});
let buffer='',last=0;child.stdout.on('data',b=>{process.stdout.write(b);if(service==='api'){buffer+=b.toString();if(buffer.length>65536)buffer='';let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{record(JSON.parse(line));}catch{}}}else if(Date.now()-last>1000){record({level:30});last=Date.now();}});
child.stderr.on('data',b=>{process.stderr.write(b);if(Date.now()-last>1000){record({level:40});last=Date.now();}});child.on('error',()=>{record({level:50});process.exitCode=1;});child.on('exit',code=>{record({level:code?50:30});process.exitCode=code||0;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
