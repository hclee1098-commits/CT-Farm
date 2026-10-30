// 공식 Ninja의 해시를 확인하여 이번 실행의 전용 SDK만 갱신합니다.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),root=process.cwd(),state=path.join(root,'.starter-state/phone-test'),owner=JSON.parse(await fs.readFile(path.join(state,'sdk-owner.json'),'utf8'));
assert.equal(owner.root,root);assert.equal(owner.sdk,path.join(state,'sdk'));
const dir=path.join(state,'ninja-1.13.2'),target=path.join(owner.sdk,'cmake/3.22.1/bin/ninja.exe');await fs.mkdir(dir,{recursive:true});
const report={startedAt:new Date().toISOString(),officialSource:'https://github.com/ninja-build/ninja/releases/tag/v1.13.2',expectedSha256:'07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65',originalSystemSdkModified:false};
try{
 const r=await fetch('https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip',{signal:AbortSignal.timeout(60000)});assert(r.ok);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),report.expectedSha256);const zip=path.join(dir,'ninja.zip');await fs.writeFile(zip,bytes);
 await exec('powershell.exe',['-NoProfile','-Command',`$ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`],{windowsHide:true});
 try{await fs.copyFile(target,path.join(dir,'original-ninja.exe'),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
 await fs.copyFile(path.join(dir,'ninja.exe'),target);report.version=(await exec(target,['--version'],{windowsHide:true})).stdout.trim();assert.equal(report.version,'1.13.2');report.status='verified';console.log('전용 SDK Ninja 1.13.2 해시·버전 확인 완료');
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{report.endedAt=new Date().toISOString();await fs.mkdir('verification/ui-mobile/phone-ninja',{recursive:true});await fs.writeFile('verification/ui-mobile/phone-ninja/results.json',JSON.stringify(report,null,2));}
