// DOM_QA_MODULE 에 별도 설치한 jsdom 의 파일 URL을 지정합니다. 프로젝트 의존성 추가 없음.
import assert from 'node:assert/strict';
import {summarize} from '../monitoring/core.mjs';
const {JSDOM}=await import(process.env.DOM_QA_MODULE);
const dom=new JSDOM('<!doctype html><main></main>',{url:'http://127.0.0.1:4310'});globalThis.document=dom.window.document;
const sample=environment=>summarize([{id:'00000000-0000-4000-8000-000000000001',environment,service:'api',kind:'request',level:'error',time:new Date().toISOString(),statusCode:500,durationMs:25}],environment);
globalThis.fetch=async url=>{
 const u=new URL(url,'http://127.0.0.1:4310'),environment=u.searchParams.get('environment'),minutes=Number(u.searchParams.get('minutes'));
 const snapshots=(environment==='ALL'?['LOCAL','STAGING','PRODUCTION']:[environment]).map(sample);
 if(u.pathname==='/monitor')return Response.json({snapshots});
 return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({environment,minutes,snapshots})+'\n\n'));}}));
};
const {showMonitor}=await import('./monitor-view.js');const main=document.querySelector('main');const handle=showMonitor(main,'test-token','dashboard');const wait=()=>new Promise(r=>setTimeout(r,30));
try{
 await wait();assert.equal(main.querySelectorAll('.card').length,1);assert.match(main.textContent,/LOCAL/);assert.match(main.querySelector('.monitor-log').textContent,/500/);
 const selects=main.querySelectorAll('select');selects[0].value='ALL';selects[0].dispatchEvent(new dom.window.Event('change'));await wait();assert.equal(main.querySelectorAll('.card').length,3);
 selects[1].value='redis';selects[1].dispatchEvent(new dom.window.Event('input'));assert.match(main.querySelector('.monitor-log').textContent,/이벤트가 없습니다/);
 selects[1].value='api';selects[1].dispatchEvent(new dom.window.Event('input'));const search=main.querySelector('input');search.value='no-such-request';search.dispatchEvent(new dom.window.Event('input'));assert.match(main.querySelector('.monitor-log').textContent,/이벤트가 없습니다/);
 search.value='';search.dispatchEvent(new dom.window.Event('input'));selects[2].value='info';selects[2].dispatchEvent(new dom.window.Event('input'));assert.match(main.querySelector('.monitor-log').textContent,/이벤트가 없습니다/);
 assert.equal(main.querySelectorAll('script').length,0);console.log('통과: 환경 선택·3열 비교·서비스/수준/검색 필터·DOM 렌더링. 실제 브라우저 레이아웃은 미검증.');
}finally{handle.abort();dom.window.close();}
