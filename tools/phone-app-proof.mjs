// 시험 앱이 전면에 있을 때만 화면을 보존합니다. 다른 앱·시스템 대화상자는 촬영하지 않습니다.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),d=JSON.parse(await fs.readFile('.starter-state/phone-test/device.json','utf8')),adb='C:/Users/hyunc/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg='kr.ctfarm.mobile.phonetest',dir='verification/ui-mobile/phone-device';
const report={startedAt:new Date().toISOString(),targetPackage:pkg,serialDisclosed:false};
try{
 const {stdout}=await exec(adb,['-s',d.id,'shell','dumpsys','window'],{windowsHide:true,maxBuffer:8*1024*1024});const focus=stdout.split(/\r?\n/).find(s=>/mCurrentFocus=/.test(s));assert(focus?.includes(pkg+'/'),'시험 앱의 전면 상태를 확인할 수 없어 촬영하지 않습니다.');
 const shot=await exec(adb,['-s',d.id,'exec-out','screencap','-p'],{windowsHide:true,encoding:'buffer',maxBuffer:32*1024*1024});assert(shot.stdout.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));await fs.mkdir(dir,{recursive:true});report.image=path.join(dir,'phone-test-app.png');await fs.writeFile(report.image,shot.stdout);report.status='captured_target_app';console.log('시험 앱 전면 화면만 보존했습니다.');
}catch(e){report.status='not_captured';report.error=String(e.message).split(d.id).join('[device id omitted]');process.exitCode=1;console.error(report.error);}finally{report.endedAt=new Date().toISOString();await fs.writeFile(path.join(dir,'app-proof.json'),JSON.stringify(report,null,2));}
