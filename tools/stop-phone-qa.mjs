// 이번 QA가 만든 자원인지 확인하고 정상 종료 표식만 보냅니다. 원본 프로세스를 종료하지 않습니다.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),q=JSON.parse(await fs.readFile('.starter-state/phone-test/qa.json','utf8'));
assert(/^[a-f\d]{12}$/.test(q.runId));assert(path.resolve(q.temp).startsWith(path.resolve(os.tmpdir())+path.sep+'ctfarm-mobile-api-'));assert.equal(q.stop,path.join(q.temp,'phone-qa.stop'));
assert.equal((await exec('docker',['inspect','--format','{{index .Config.Labels "ct-farm.mobile-api"}}',q.pgId],{windowsHide:true})).stdout.trim(),q.runId);
await fs.writeFile(q.stop,'stop',{flag:'wx'});console.log('확인된 시험 API에 정상 종료 표식을 보냈습니다.');
