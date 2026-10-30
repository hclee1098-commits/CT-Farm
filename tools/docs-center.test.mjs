import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {searchDocuments,headings,resolveLink} from '../.starter-state/docs-view.js';
const dir='docs/09-CT-Farm-안내',catalog=JSON.parse(fs.readFileSync('apps/web/public/docs-center/catalog.json','utf8'));
const docs=catalog.map(d=>({...d,text:fs.readFileSync(d.path,'utf8')}));
test('공개 allowlist · 원본 일치 · 내부 파일 경로 · 문서 이동',()=>{
 assert.equal(docs.length,14);assert.equal(new Set(docs.map(d=>d.title)).size,14);
 assert.ok(docs.some(d=>d.path.endsWith('모바일앱과-디자인.md')));
 assert.ok(docs.some(d=>d.path.endsWith('6차-음성과-실행복구.md')));
 assert.ok(docs.some(d=>d.path.endsWith('5차-검증과-권한확장.md')));
 for(const d of docs){assert.ok(d.path.startsWith(dir+'/'));assert.equal(new Date(d.modified).toISOString(),fs.statSync(d.path).mtime.toISOString());
 for(const m of d.text.replace(/```[\s\S]*?```/g,'').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=resolveLink(d.path,m[1]);if(target)assert.ok(fs.existsSync(target.path),d.path+' → '+target.path);}
 assert.doesNotMatch(d.text,/sk-proj-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/);
 }
 assert.ok(fs.readFileSync('tools/build-docs-center.mjs','utf8').includes("const names=['시작'"));
});
test('제목 · 본문 검색 · 빈 결과 · 목차 중복 · 위험 링크',()=>{
 assert.ok(searchDocuments(docs,'원격 제어').length>0);assert.ok(searchDocuments(docs,'#137548').length===1);assert.equal(searchDocuments(docs,'존재하지않는검색어XYZ').length,0);
 assert.equal(headings('# 같은\n## 같은\n```md\n## 코드\n```')[1].id,'같은-1');
 assert.equal(resolveLink(docs[0].path,'javascript:alert(1)'),null);assert.equal(resolveLink(docs[0].path,'//outside.invalid'),null);
 for(const d of docs){const hs=headings(d.text);assert.equal(hs[0].level,1);assert.equal(new Set(hs.map(h=>h.id)).size,hs.length);}
});
test('모든 DB 모델 · 기능의 12개 정보 · 동적 API 한계 표시',()=>{
 const schema=fs.readFileSync('apps/api/prisma/schema.prisma','utf8'),api=docs.find(d=>d.path.endsWith('API-데이터-목록.md')).text;
 for(const m of schema.matchAll(/^model (\w+)/gm))assert.ok(api.includes('### '+m[1]));
 assert.match(api,/operationsRouter\[method\]/);const feature=docs.find(d=>d.path.endsWith('기능-설명.md')).text;
 assert.equal((feature.match(/- 목적:/g)||[]).length,22);for(const section of feature.split('\n## ').slice(2))for(const field of ['목적','사용법·화면 위치','프론트엔드','백엔드','API','데이터베이스','의존성','보안·접근 권한','현재 구현 상태','테스트·알려진 문제·개선','검증 근거','관련 문서'])assert.ok(section.includes('- '+field+':'),field);
});
test('SVG 원본 · PNG 크기와 투명도 · ICO 실제 PNG payload',async()=>{
 for(const name of ['logo-light','logo-dark','symbol','app-icon','favicon']){
 const svg=fs.readFileSync(`apps/web/public/brand/${name}.svg`,'utf8');assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<image|https?:\/\/(?!www.w3.org)/);
 const meta=await sharp(`apps/web/public/brand/${name}.png`).metadata();assert.ok(meta.width>0&&meta.height>0);assert.equal(meta.format,'png');if(name.startsWith('logo'))assert.equal(meta.hasAlpha,true);
 }
 for(const size of [192,512]){const m=await sharp(`apps/web/public/brand/app-icon-${size}.png`).metadata();assert.equal(m.width,size);assert.equal(m.height,size);}
 const ico=fs.readFileSync('apps/web/public/favicon.ico');assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt32LE(18),22);assert.equal(ico.subarray(22,30).toString('hex'),'89504e470d0a1a0a');
});
