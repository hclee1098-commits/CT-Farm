// 명시한 로컬 격리 검사만 실행합니다. 운영 환경파일을 읽거나 DB에 적용하지 않습니다.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const round=process.env.EVIDENCE_ROUND==='round6'?'round6':'round5';
const run=path.join(root,'verification',round,new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(run,{recursive:true});
const commands={api:['node_modules/vitest/vitest.mjs','run','--root','apps/api','--reporter=json'],web:['node_modules/vitest/vitest.mjs','run','--root','apps/web','--reporter=json'],farm:['--import','tsx','tools/test-farm.mts'],platform:['tools/test-platform.mjs'],mail:['--import','tsx','tools/test-mail.mts'],sql:['tools/test-migrations.mjs'],backup:['tools/test-backup.mjs'],incidents:['--test','tools/monitoring/incidents.test.mjs']};
commands.capabilities=['--test','tools/round5/capabilities.test.mjs'];
commands.delivery=['--test','tools/monitoring/delivery.test.mjs'];
commands.disks=['--test','tools/monitoring/disks.test.mjs'];
commands.monitoring=['--test','tools/monitoring/monitoring.test.mjs'];
commands.recovery=['--max-old-space-size=512','--test','tools/round5/recovery.test.mjs'];
commands['docs-center']=['--test','tools/docs-center.test.mjs'];
commands.docs=['--test','tools/dev-portal/docs.test.mjs'];
commands.deployment=['--test','tools/deployment/release.test.mjs'];
commands['web-typecheck']=['node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit','--incremental','false'];
commands['api-typecheck']=['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json','--noEmit'];
commands['round6-native']=['--import','tsx','tools/round6-native.mts'];
commands['api-build']=['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json'];
commands['round6-staging']=['tools/round6-staging.mjs'];
commands['round6-runtime']=['tools/round6-runtime.mjs'];
const selected=process.argv.slice(2);if(!selected.length||selected.some(k=>!commands[k]))throw Error('검사 이름을 명시하세요: '+Object.keys(commands).join(', '));
const report={startedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,cpuCount:os.cpus().length,ramBytes:os.totalmem()},scope:'isolated test fixtures only; no source DB migration or service control',checks:[]};
for(const name of selected){
 const startedAt=new Date().toISOString(),args=[...commands[name]],log=path.join(run,name+'.log');let output='';
 if(['api','web'].includes(name))args.push('--outputFile',path.join(run,name+'-vitest.json'));
 const env={...process.env,NODE_ENV:'test',APP_ENV:'LOCAL',NO_COLOR:'1',FARM_TEST_PERFORMANCE_PATH:path.join(run,'performance-pglite.json')};
 // 상속된 실제 DB/Redis/외부 메일·환경 선택을 제거합니다. 각 harness가 별도 연결을 구성합니다.
 for(const key of Object.keys(env))if(/^(DATABASE_URL|FARM_TEST_DATABASE_URL|REDIS_URL|REDIS_SERVER_BIN|SMTP_|MAIL_|MONITOR_|UPLOAD_DIR)/.test(key))delete env[key];
 if(name==='monitoring'&&!env.OPENSSL_BIN){const bundled='C:/Program Files/Git/usr/bin/openssl.exe';try{await fs.access(bundled);env.OPENSSL_BIN=bundled;}catch{}}
 const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const exitCode=await new Promise(resolve=>{child.on('error',e=>{output+='\nSPAWN_ERROR '+e.code;resolve(-1);});child.on('close',code=>resolve(code));});
 // harness는 합성 데이터만 출력합니다. 추가 방어로 연결 문자열·Bearer 토큰은 지웁니다.
 output=output.replace(/(?:postgres(?:ql)?|redis):\/\/[^\s"']+/gi,'[connection redacted]').replace(/Bearer\s+[A-Za-z0-9_.-]+/g,'Bearer [redacted]');await fs.writeFile(log,output);
 let counts={passed:null,failed:null,skipped:null,unit:'unknown'};
 if(['api','web'].includes(name)){try{const raw=await fs.readFile(path.join(run,name+'-vitest.json'),'utf8');const j=JSON.parse(raw);counts={passed:j.numPassedTests,failed:j.numFailedTests,skipped:j.numPendingTests,unit:'test'};}catch{}}
 else if(['farm','platform','mail','sql','backup','round6-native'].includes(name)){counts={passed:(output.match(/^통과:/gm)||[]).length,failed:exitCode===0?0:null,skipped:0,unit:name==='farm'?'group':'check'};}
 else {const p=output.match(/(?:#|ℹ) pass (\d+)/),f=output.match(/(?:#|ℹ) fail (\d+)/),s=output.match(/(?:#|ℹ) skipped (\d+)/);if(p)counts={passed:+p[1],failed:f?+f[1]:null,skipped:s?+s[1]:null,unit:'test'};}
 report.checks.push({name,command:[process.execPath,...args],startedAt,endedAt:new Date().toISOString(),exitCode,status:exitCode===0?'passed':'failed',database:name==='round6-native'?'native PostgreSQL 16':['farm','platform','mail'].includes(name)?'PGlite':'see test log',...counts,rawLog:path.relative(root,log)});
 await fs.writeFile(path.join(run,'results.json'),JSON.stringify(report,null,2));console.log(name+': exit '+exitCode+' '+JSON.stringify(counts));
}
report.endedAt=new Date().toISOString();await fs.writeFile(path.join(run,'results.json'),JSON.stringify(report,null,2));console.log(path.relative(root,path.join(run,'results.json')));process.exitCode=report.checks.some(c=>c.exitCode!==0)?1:0;
