import test from 'node:test';
import assert from 'node:assert/strict';
import {safeEvent} from './developer-event.mjs';
test('중첩 비밀값, URL, 자유 텍스트, 잘못된 숫자를 로그에서 제거한다',()=>{const record=safeEvent('api',{level:50,statusCode:500,durationMs:Infinity,path:'/private-token',msg:'sensitive-message',nested:{password:'private-password'},requestId:'invalid-secret'});const text=JSON.stringify(record);for(const secret of ['private-token','sensitive-message','private-password','invalid-secret'])assert.ok(!text.includes(secret));assert.equal(record.statusCode,500);assert.equal(record.durationMs,undefined);});
