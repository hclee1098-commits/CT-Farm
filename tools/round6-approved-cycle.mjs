// 사용자가 승인한 원본 STOP→START 1회 검사입니다. DB migration/볼륨 삭제는 수행하지 않습니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import os from 'node:os';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=process.cwd();
assert(process.argv.includes('--approved-stop-start'),'명시적 승인 인자가 필요합니다.');
assert.equal(root.toLowerCase(),'c:\\workspace\\ct-farm');
const dir=path.join('verification/round6','approved-cycle-'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(dir,{recursive:true});
const original=JSON.parse(await fs.readFile('.starter-state/runtime.json','utf8'));
const identity=JSON.parse(await fs.readFile('.starter-state/identity.json','utf8'));
assert.equal(original.root.toLowerCase(),root.toLowerCase());assert.equal(original.project,identity.Project);
assert.equal(identity.ApiPort,4000);assert.equal(identity.WebPort,3000);
await fs.copyFile('.starter-state/runtime.json',path.join(dir,'runtime-before.json'));
await fs.copyFile('SECURE-LIFECYCLE.ps1',path.join(dir,'launcher-before.snapshot'));
const report={authorization:'user explicitly approved original STOP→START in this chat',startedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,osRelease:os.release(),cpuCount:os.cpus().length,ramBytes:os.totalmem()},checks:[],sourceMigrationApplied:false,databaseReset:false,volumeDeletion:false};
const save=()=>fs.writeFile(path.join(dir,'results.json'),JSON.stringify(report,null,2));
function redact(s){return String(s||'').replace(/(?:postgres(?:ql)?|redis):\/\/[^\s"']+/gi,'[connection redacted]').replace(/Bearer\s+[\w.-]+/gi,'Bearer [redacted]').replace(/(<S N="(?:User|Computer)">)[^<]*(<\/S>)/g,'$1[host metadata redacted]$2');}
async function containers(){const ids=(await exec('docker',['ps','-aq'],{windowsHide:true})).stdout.trim().split(/\s+/).filter(Boolean);const rows=[];for(const id of ids){const j=JSON.parse((await exec('docker',['inspect','--format','{"Id":{{json .Id}},"Running":{{json .State.Running}},"Project":{{json (index .Config.Labels "com.docker.compose.project")}},"Mounts":{{json .Mounts}}}',id],{windowsHide:true})).stdout);rows.push({id:j.Id,running:j.Running,project:j.Project,mounts:j.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination}))});}return rows.sort((a,b)=>a.id.localeCompare(b.id));}
async function health(){const rows=[];for(const url of ['http://127.0.0.1:4000/health/ready','http://localhost:3000/starter'])try{rows.push({url,status:(await fetch(url,{signal:AbortSignal.timeout(8000)})).status});}catch{rows.push({url,status:'unreachable'});}return rows;}
async function action(action){const startedAt=new Date().toISOString();
 const code=`[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); & .\\SECURE-LIFECYCLE.ps1 -Action '${action}'; exit $LASTEXITCODE`;
 const args=['-NoProfile','-OutputFormat','Text','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')];
 // 백그라운드 서버의 콘솔 자식이 pipe 핸들을 상속하면 execFile callback은
 // PowerShell 종료 뒤에도 close를 기다립니다. 로그 파일과 실제 exit를 사용합니다.
 const rawLog=path.join(dir,`${report.checks.length}-${action}.log`),fd=openSync(rawLog,'wx',0o600);let timedOut=false,exitCode;
 try{
  const child=spawn('powershell.exe',args,{env:{...process.env,APP_ENV:'LOCAL',SECURE_STARTER_NO_BROWSER:'1'},windowsHide:true,stdio:['ignore',fd,fd]});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
  try{exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('exit',code=>resolve(timedOut?124:code??-1));});}finally{clearTimeout(timer);}
 }finally{closeSync(fd);}
 await fs.writeFile(rawLog,redact(await fs.readFile(rawLog,'utf8')));
 const check={command:['powershell.exe',...args],readableCommand:'powershell.exe -File SECURE-LIFECYCLE.ps1 -Action '+action,outputEncoding:'UTF-8',action,startedAt,endedAt:new Date().toISOString(),exitCode,timedOut,rawLog};report.checks.push(check);await save();console.log(action+': exit '+exitCode);return check;}
// 런처의 기존 소유권 검사 함수를 그대로 호출합니다. 포트 번호만으로 프로세스를 인수하지 않습니다.
const preflight=`$ErrorActionPreference='Stop';$root=(Get-Location).Path;$stateDir=Join-Path $root '.starter-state';$runtimeFile=Join-Path $stateDir 'runtime.json';$identityFile=Join-Path $stateDir 'identity.json';$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'SECURE-LIFECYCLE.ps1'),[ref]$tokens,[ref]$errors);if(@($errors).Count){throw 'PARSE'};foreach($d in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){Invoke-Expression $d.Extent.Text};$state=Get-Content -LiteralPath $runtimeFile -Raw|ConvertFrom-Json;Assert-ManagedListeners (Get-Identity);$rows=@();foreach($name in @('api','web','collector')){$entry=$state.$name;if(!(Test-OwnedProcess $entry)){throw 'OWNERSHIP'};$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$entry.pid);$rows+=[pscustomobject]@{name=$name;pid=$p.ProcessId;parentPid=$p.ParentProcessId;executable=$p.ExecutablePath;created=$p.CreationDate.ToUniversalTime().ToString('o');recordedStarted=$entry.started;ownedProcess=$true}};$rows|ConvertTo-Json -Depth 4`;
let stopAttempted=false;
try{
 report.environment.powershellVersion=(await exec('powershell.exe',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()'],{windowsHide:true})).stdout.trim();
 report.before=await containers();report.healthBefore=await health();assert(report.healthBefore.every(r=>r.status===200),'시작 전 정상 응답 필요');
 const pre=await exec('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(preflight,'utf16le').toString('base64')],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});report.ownershipBefore=JSON.parse(pre.stdout.trim());await save();
 stopAttempted=true;const stop=await action('STOP');assert.equal(stop.exitCode,0,'STOP 실패');
 report.afterStop=await containers();report.healthAfterStop=await health();await save();
 assert(report.healthAfterStop.every(r=>r.status==='unreachable'),'STOP 후 HTTP 포트가 남았습니다.');
 const start=await action('STARTER');assert.equal(start.exitCode,0,'STARTER 실패');
 const startedRuntime=JSON.parse(await fs.readFile('.starter-state/runtime.json','utf8'));
 const duplicate=await action('STARTER');assert.equal(duplicate.exitCode,0,'중복 STARTER 실패');
 const status=await action('STATUS');assert.equal(status.exitCode,0,'STATUS 실패');
 report.runtimeAfter=JSON.parse(await fs.readFile('.starter-state/runtime.json','utf8'));
 report.duplicateStartRetainedPids=['api','web','collector'].every(name=>report.runtimeAfter[name]?.pid===startedRuntime[name]?.pid&&report.runtimeAfter[name]?.started===startedRuntime[name]?.started);
 assert(report.duplicateStartRetainedPids,'중복 STARTER가 프로세스를 교체했습니다.');
 report.status='passed';
}catch(e){report.status='failed';report.error=redact(e.message);console.error(report.error);process.exitCode=1;}
finally{
 // STOP을 시도한 뒤 실패해도 승인 범위 안에서 서비스를 복구합니다. 소유권 검사는 STARTER에 남아 있습니다.
 if(stopAttempted&&(await health()).some(r=>r.status!==200)){report.recoveryStart=await action('STARTER');}
 report.after=await containers();report.healthAfter=await health();
 const stable=rows=>rows.map(({id,project,mounts})=>({id,project,mounts}));
 report.containerIdsAndMountsUnchanged=JSON.stringify(stable(report.before||[]))===JSON.stringify(stable(report.after));
 report.otherContainersRunningStateUnchanged=(report.before||[]).filter(r=>r.project!==identity.Project).every(r=>report.after.some(a=>a.id===r.id&&a.running===r.running));
 report.finalReady=report.healthAfter.every(r=>r.status===200);report.endedAt=new Date().toISOString();
 if(!report.finalReady||!report.containerIdsAndMountsUnchanged||!report.otherContainersRunningStateUnchanged){report.status='failed';process.exitCode=1;}
 await save();console.log(JSON.stringify({status:report.status,finalReady:report.finalReady,containerIdsAndMountsUnchanged:report.containerIdsAndMountsUnchanged,otherContainersRunningStateUnchanged:report.otherContainersRunningStateUnchanged,resultFile:path.join(dir,'results.json')}));
}
