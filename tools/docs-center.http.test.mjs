// 빌드한 웹 서버를 별도로 실행한 뒤 호출합니다. 사용자 자료를 변경하지 않습니다.
import test from 'node:test';
import assert from 'node:assert/strict';
const origin=process.env.DOCS_TEST_ORIGIN||'http://localhost:3000';
test('기존 웹에서 문서센터·정적 로고·favicon 제공 및 내부 원본 비공개',async()=>{
 const html=await fetch(origin+'/docs-center/index.html');assert.equal(html.status,200);assert.match(await html.text(),/CT-Farm 문서센터/);assert.match(html.headers.get('x-content-type-options'),/nosniff/);
 const js=await fetch(origin+'/docs-center/app.js');assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
 for(const file of ['logo-light.svg','logo-dark.svg','symbol.svg','app-icon.svg','favicon.svg','app-icon-192.png','app-icon-512.png']){const r=await fetch(origin+'/brand/'+file);assert.equal(r.status,200,file);assert.match(r.headers.get('content-type'),file.endsWith('svg')?/image\/svg/:/image\/png/);}
 const ico=await fetch(origin+'/favicon.ico');assert.equal(ico.status,200);const data=Buffer.from(await ico.arrayBuffer());assert.equal(data.readUInt16LE(2),1);
 const shell=await (await fetch(origin+'/starter')).text();assert.match(shell,/도움말 · 문서/);assert.match(shell,/brand\/logo-light.svg/);
 for(const p of ['/docs/CT-Farm-개발현황.md','/documents','/docs-center/.env','/tools/dev-portal/server.mjs'])assert.equal((await fetch(origin+p)).status,404,p);
});
