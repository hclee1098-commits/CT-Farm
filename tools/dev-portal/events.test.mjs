import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readEvents} from './events.mjs';
test('고정 로그 수집: 100건 제한·기간·민감정보 제거·손상 행 무시',()=>{const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'secure-events-'));try{const dir=path.join(temporary,'apps/api/.starter-state');fs.mkdirSync(dir,{recursive:true});const events=Array.from({length:150},()=>({time:new Date().toISOString(),service:'api',level:'info',statusCode:200,durationMs:3,msg:'sensitive-token',headers:{authorization:'private-token'}}));events.push({...events[0],time:new Date(Date.now()-7200000).toISOString()});fs.writeFileSync(path.join(dir,'developer-events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\ninvalid json\n');const result=readEvents(temporary);assert.equal(result.length,100);assert.ok(!JSON.stringify(result).includes('sensitive-token'));assert.ok(!JSON.stringify(result).includes('private-token'));assert.ok(result.every(e=>Date.parse(e.time)>Date.now()-3600000));}finally{fs.rmSync(temporary,{recursive:true,force:true});}});
