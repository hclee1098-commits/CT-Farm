import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {processIncidents,readIncidents,acknowledgeIncident} from './incidents.mjs';
import {diskState} from './collector.mjs';
test('디스크 공간 부족·정상·조회 불가 구분',()=>{assert.equal(diskState(100,200),'down');assert.equal(diskState(200,200),'up');assert.equal(diskState(NaN),'unknown');});
const event=(service,status,extra={})=>({id:crypto.randomUUID(),environment:'LOCAL',service,status,kind:'health',level:'error',time:new Date().toISOString(),...extra});
test('장애·복구 중복 억제와 처리 확인·비밀정보 없는 시험 발송',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctfarm-incident-'));try{
 const down=event('api','down',{password:'never-save-this'});let r=processIncidents(dir,'LOCAL',[down,down],{testDelivery:true});assert.equal(r.incidents.length,1);assert.equal(r.transitions.length,1);
 processIncidents(dir,'LOCAL',[event('api','down')],{testDelivery:true});acknowledgeIncident(dir,'LOCAL',r.incidents[0].id);assert.ok(readIncidents(dir,'LOCAL').incidents[0].acknowledgedAt);
 r=processIncidents(dir,'LOCAL',[event('api','up')],{testDelivery:true});assert.equal(r.transitions[0].transition,'RECOVERED');assert.ok(r.incidents[0].resolvedAt);assert.equal(readIncidents(dir,'LOCAL').outbox.length,2);assert(!fs.readFileSync(path.join(dir,'LOCAL/incidents.json'),'utf8').includes('never-save-this'));
 assert.equal(processIncidents(dir,'STAGING',[down]).incidents.length,0);assert.throws(()=>acknowledgeIncident(dir,'LOCAL','../x'));
 }finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'ctfarm-incident-'));fs.rmSync(dir,{recursive:true,force:true});}});
test('백업·배포 실패/복구, 기본 외부 발송 미설정',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctfarm-incident-'));try{
 for(const [service,kind] of [['backup','backup'],['deployment','deploy']]){let r=processIncidents(dir,'LOCAL',[event(service,'unknown',{kind,result:'failed'})]);assert.equal(r.incidents[0].delivery,'NOT_CONFIGURED');processIncidents(dir,'LOCAL',[event(service,'unknown',{kind,result:'success'})]);}
 assert.equal(readIncidents(dir,'LOCAL').outbox.length,0);assert(readIncidents(dir,'LOCAL').incidents.every(i=>i.resolvedAt));
 }finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'ctfarm-incident-'));fs.rmSync(dir,{recursive:true,force:true});}});
