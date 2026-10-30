// 프로젝트에 브라우저 테스트 패키지를 추가하지 않습니다.
// DOM_QA_MODULE에 사용자가 준비한 jsdom의 파일 URL을 지정하세요.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {JSDOM}=await import(process.env.DOM_QA_MODULE);
const dom=new JSDOM('<!doctype html><body><div id="root"></div><article></article></body>',{url:'http://127.0.0.1:4310'});
for(const k of ['window','document','DOMParser','HTMLElement','Element','Node','SVGElement','HTMLCanvasElement'])globalThis[k]=dom.window[k];
globalThis.matchMedia=()=>({matches:true});
// SVG 레이아웃은 jsdom에 없으므로 실제 렌더링 성공은 판정하지 않습니다.
const view=await import(pathToFileURL(new URL('../../.starter-state/docs-view.js',import.meta.url).pathname));
const {renderMarkdown,searchDocuments,resolveLink,headings,showDocs}=view;
const article=document.querySelector('article');
await renderMarkdown(article,'# 제목\n\n## 상세\n\n**강조**와 `코드`\n\n| 열 | 값 |\n|---|---|\n| A | B |\n\n```js\nconst value = 1;\n```\n\n<script>globalThis.attacked=1</script><img src="https://outside.invalid/x" onerror="globalThis.attacked=1"><a href="javascript:alert(1)">링크</a>');
assert.ok(article.querySelector('h1'));assert.ok(article.querySelector('table'));assert.ok(article.querySelector('strong'));assert.ok(article.querySelector('pre code'));assert.equal(article.querySelector('script,img,[onerror]'),null);assert.ok(!article.innerHTML.includes('javascript:'));assert.equal(globalThis.attacked,undefined);
console.log('통과: Markdown 제목·표·강조·코드 및 HTML 공격 정화');
const docs=[{path:'docs/README.md',title:'문서센터',description:'첫 안내',text:'# 문서센터\n\n[기능](기능.md)\n\n## 시작'}, {path:'docs/기능.md',title:'기능 목록',description:'설명',text:'# 기능 목록\n\n본문고유검색어\n\n[소스](../tools/dev-portal/server.mjs)'}];
assert.equal(searchDocuments(docs,'기능 목록').length,1);assert.equal(searchDocuments(docs,'본문고유검색어').length,1);assert.equal(searchDocuments(docs,'없는검색어').length,0);assert.equal(resolveLink(docs[0].path,'javascript:alert(1)'),null);assert.equal(resolveLink(docs[0].path,'//outside.invalid/x'),null);assert.equal(resolveLink(docs[0].path,'기능.md').path,'docs/기능.md');assert.equal(headings('# 같은 제목\n## 같은 제목')[1].id,'같은-제목-1');
globalThis.fetch=async()=>({ok:true,json:async()=>docs});const container=document.querySelector('#root');let sourcePath;
const opts={container,query:'',token:'test-fixture',source:p=>sourcePath=p};await showDocs(opts);assert.equal(container.querySelectorAll('.docs-nav button').length,2);assert.ok(container.querySelector('.docs-toc a'));
container.querySelector('.docs-article a').click();await new Promise(r=>setTimeout(r,0));assert.match(container.querySelector('.docs-article h1').textContent,/기능/);container.querySelector('.docs-article a').click();assert.equal(sourcePath,'tools/dev-portal/server.mjs');await showDocs({...opts,query:'없는검색어'});assert.match(container.textContent,/검색 결과가 없습니다/);
console.log('통과: 제목·본문 검색, 관련 문서 이동, 소스 경로, 세부 목차, 빈 결과');
// Mermaid 문법은 공식 파서로 전수 검사. SVG 시각 검사는 실제 브라우저가 필요합니다.
const mermaid=(await import('mermaid')).default;let count=0;
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):e.name.endsWith('.md')?[p+'/'+e.name]:[]);
for(const file of walk(new URL('../../docs',import.meta.url).pathname))for(const m of fs.readFileSync(file,'utf8').matchAll(/```mermaid\n([\s\S]*?)```/g)){await mermaid.parse(m[1]);count++;}
console.log(`통과: Mermaid 공식 파서 ${count}개 다이어그램 문법 검사 (실제 SVG 레이아웃 미검증)`);
