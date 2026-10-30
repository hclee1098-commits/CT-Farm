import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPortal} from './server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Next dev가 생성하는 AGENTS.md는 사용자 문서가 아니라 해당 경로의 에이전트 지침입니다. 삭제·이동하지 않습니다.
function docs(dir=root){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(['node_modules','.git','.next','.expo','.gradle','dist','.starter-state','AGENTS.md'].includes(e.name))return [];const p=path.join(dir,e.name);if(p===path.join(root,'verification','runtime'))return [];return e.isDirectory()?docs(p):p.endsWith('.md')?[p]:[];});}
test('문서 통합 위치, 실제 파일 링크와 중복 제목 검사',()=>{
 let count=0;const names=new Set();for(const p of docs()){
  assert.ok(p===path.join(root,'README.md')||p.startsWith(path.join(root,'docs')+path.sep),'외부 문서: '+p);
  const text=fs.readFileSync(p,'utf8'),title=text.match(/^# (.+)$/m)?.[1];assert.ok(title,p);
  if(p.startsWith(path.join(root,'docs')+path.sep)){assert.ok(!names.has(title),'중복 제목: '+title);names.add(title);}
  const body=text.replace(/```[\s\S]*?```/g,'');
  for(const m of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
   const href=decodeURIComponent(m[1].replace(/^<|>$/g,''));if(/^[a-z]+:/i.test(href))continue;const [rel,anchor]=href.split('#'),dest=path.resolve(path.dirname(p),rel||path.basename(p));
   assert.ok(dest.startsWith(root+path.sep),'프로젝트 밖 링크');assert.ok(fs.existsSync(dest),p+' → '+href);count++;
   if(anchor&&dest.endsWith('.md')){const headings=fs.readFileSync(dest,'utf8').match(/^#{1,6} .+$/gm)||[];assert.ok(headings.some(h=>h.replace(/^#+ /,'').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-')===anchor),`목차 누락: ${p} → ${href}`);}
  }
 }
 console.log(`문서 링크 ${count}개 확인`);
});
test('문서 API 인증·전체 본문·고정 경로 제한·렌더러 로컬 제공',async()=>{
 const token='docs-test-'+ 'x'.repeat(40),server=createPortal({token});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/documents')).status,401);assert.equal((await fetch(base+'/documents',{headers:{Authorization:'Bearer wrong'}})).status,401);
 const headers={Authorization:'Bearer '+token};const response=await fetch(base+'/documents',{headers});assert.equal(response.status,200);const data=await response.json();assert.equal(data.length,docs(root+'/docs').length);
 for(const doc of data){assert.ok(doc.path.startsWith('docs/'));assert.ok(doc.title);assert.equal(doc.text,fs.readFileSync(path.join(root,doc.path),'utf8'));}
 assert.equal((await fetch(base+'/documents?path=../../.env',{headers})).status,404);
 assert.equal((await fetch(base+'/documents',{method:'POST',headers})).status,405);
 assert.equal((await fetch(base+'/documents',{headers:{...headers,Origin:'https://outside.invalid'}})).status,403);
 const bundle=await fetch(base+'/docs-view.js');assert.equal(bundle.status,200);assert.match(bundle.headers.get('content-type'),/javascript/);assert.match(response.headers.get('cache-control'),/no-store/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
