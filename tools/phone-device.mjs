// 사용자 기기 ID를 공개 로그에 출력하지 않습니다. 선택/설치/연결은 명시 인자로만 실행합니다.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
import {parseDevices} from './phone-device-list.mjs';
const exec=promisify(execFile),adb='C:/Users/hyunc/AppData/Local/Android/Sdk/platform-tools/adb.exe',state='.starter-state/phone-test';await fs.mkdir(state,{recursive:true});
const rows=parseDevices((await exec(adb,['devices','-l'],{windowsHide:true})).stdout);
const targets=rows.filter(d=>!d.emulator&&d.status==='device');
const report={measuredAt:new Date().toISOString(),physicalAuthorized:targets.length,unauthorized:rows.filter(d=>d.status==='unauthorized').length,models:targets.map(d=>d.model),serialDisclosed:false,installed:false};
try{
 if(targets.length!==1){report.status=targets.length?'multiple_devices_need_selection':'waiting_for_USB_authorization';console.log(JSON.stringify(report));}
 else{
  const d=targets[0],call=async args=>(await exec(adb,['-s',d.id,...args],{windowsHide:true,maxBuffer:1024*1024})).stdout.trim();
  const api=Number(await call(['shell','getprop','ro.build.version.sdk'])),abis=(await call(['shell','getprop','ro.product.cpu.abilist'])).split(',');report.androidApi=api;report.arm64=abis.includes('arm64-v8a');
  await fs.writeFile(path.join(state,'device.json'),JSON.stringify({...d,androidApi:api,abis}),{mode:0o600});
  if(process.argv.includes('--install')){
   assert(api>=24&&abis.includes('arm64-v8a'),'시험 APK의 Android/CPU 조건과 다릅니다.');const m=JSON.parse(await fs.readFile(path.join(state,'apk.json'),'utf8'));assert.equal(m.applicationId,'kr.ctfarm.mobile.phonetest');
   assert(path.resolve(m.file).startsWith(path.resolve('artifacts')+path.sep));
   assert.equal(createHash('sha256').update(await fs.readFile(m.file)).digest('hex'),m.sha256,'APK 해시가 빌드 기록과 다릅니다.');
   const manifest=(await exec(path.join(m.sdk,'build-tools/37.0.0/aapt2.exe'),['dump','badging',path.resolve(m.file)],{windowsHide:true,maxBuffer:1024*1024})).stdout;
   assert.equal(manifest.match(/package: name='([^']+)'/)?.[1],m.applicationId,'실제 APK 패키지가 시험용 ID와 다릅니다.');
   const existing=await call(['shell','pm','list','packages',m.applicationId]);assert(!existing.split(/\r?\n/).some(x=>x==='package:'+m.applicationId),'같은 패키지의 기존 앱이 있어 덮어쓰지 않습니다.');
   assert((await call(['install',path.resolve(m.file)])).includes('Success'),'APK_INSTALL_FAILED');report.installed=true;
  }
  if(process.argv.includes('--connect')){
   const q=JSON.parse(await fs.readFile(path.join(state,'qa.json'),'utf8'));assert(q.expiresAt>Date.now());const u=new URL(q.apiBase);assert.equal(u.hostname,'127.0.0.1');assert(!['3000','4000'].includes(u.port));
   await call(['reverse','--no-rebind','tcp:4084','tcp:'+u.port]);await call(['reverse','--no-rebind','tcp:18081','tcp:18081']);report.reversePorts=[4084,18081];
  }
  if(process.argv.includes('--launch')){
   const packageName='kr.ctfarm.mobile.phonetest';assert((await call(['shell','pm','list','packages',packageName])).split(/\r?\n/).includes('package:'+packageName),'시험 앱이 설치되지 않았습니다.');
   const q=JSON.parse(await fs.readFile(path.join(state,'qa.json'),'utf8')),u=new URL(q.apiBase);assert(q.expiresAt>Date.now());assert.equal(u.hostname,'127.0.0.1');
   const reverse=(await call(['reverse','--list'])).split(/\r?\n/).map(s=>s.trim().split(/\s+/).slice(-2).join(' '));assert(reverse.includes('tcp:4084 tcp:'+u.port)&&reverse.includes('tcp:18081 tcp:18081'),'현재 시험 서버의 USB 연결이 필요합니다.');report.reversePorts=[4084,18081];
   const link='exp+ct-farm-phone-test://expo-development-client/?url='+encodeURIComponent('http://127.0.0.1:18081');
   const result=await call(['shell','am','start','-W','-a','android.intent.action.VIEW','-d',link,packageName]);assert(!/Error:|Exception/.test(result),'앱 시작 실패');report.launchRequested=true;
  }
  report.status='device_checked';console.log(JSON.stringify(report));
 }
}catch(e){report.status='failed';report.error=rows.reduce((s,d)=>s.split(d.id).join('[device id omitted]'),String(e.message));console.error(report.error);process.exitCode=1;}
const evidence=path.join('verification/ui-mobile/phone-device',report.measuredAt.replace(/[:.]/g,'-'));await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'results.json'),JSON.stringify(report,null,2));await fs.writeFile('verification/ui-mobile/phone-device/latest.json',JSON.stringify(report,null,2));
