import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {root,analyze} from './analyze-project.mjs';
const output=path.join(root,'analysis/project.json');
// Expo의 (tabs), 동적 [id] 등을 Markdown 링크 대상으로 안전하게 만듭니다.
const encodeDocPath=p=>p.split('/').map(s=>encodeURIComponent(s).replace(/[()]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');
if(process.argv.includes('--check')){
 const saved=JSON.parse(fs.readFileSync(output,'utf8'));let count=0;
 for(const f of saved.files){assert.ok(fs.existsSync(path.join(root,f.path)),`파일 누락: ${f.path}`);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex'),f.hash,`분석 후 변경됨: ${f.path}`);for(const p of [...f.internalDependencies,...f.tests,...f.documents])assert.ok(fs.existsSync(path.join(root,p)),`연결 누락: ${p}`);count++;}
 const current=analyze();const old=new Set(saved.files.map(f=>f.path));assert.ok(current.files.every(f=>old.has(f.path)),'새 파일이 추가됨: docs:index 재실행 필요');
 let links=0;for(const f of current.files.filter(f=>f.type==='.md'&&f.path.startsWith('docs/'))){const text=fs.readFileSync(path.join(root,f.path),'utf8').replace(/```[\s\S]*?```/g,'');for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){let target=decodeURIComponent(m[1]).replace(/^<|>$/g,'').split('#')[0];if(!target||/^[a-z]+:/i.test(target)||target.startsWith('/'))continue;assert.ok(fs.existsSync(path.resolve(root,path.dirname(f.path),target)),`문서 링크 누락: ${f.path} → ${target}`);links++;}}
 console.log(`성공: 분석 스냅샷 ${count}개 파일 해시/정적 참조, 문서 링크 ${links}개. 의미적 동작 일치는 미검증.`);
}else{
 fs.mkdirSync(path.join(root,'docs/07-기술참고'),{recursive:true});const initial=analyze();fs.writeFileSync(path.join(root,'docs/07-기술참고/전체-파일색인.md'),'# 전체 파일 역할과 정적 참조 색인\n\n> **알 수 있는 것:** 파일 경로·역할·정적 연결 수\n>\n> **읽을 때:** 관련 소스를 찾을 때\n>\n> **관련 기능:** 정적 파일 분석\n>\n> **관련 소스:** [분석기](../../tools/analyze-project.mjs)\n>\n> **관련 문서:** [문서센터](../README.md)\n\nAST/정규식 정적 분석입니다. 사용되지 않음/삭제 가능을 확정하지 않습니다. 포털에서 함수·Props·참조와 줄 번호를 확인하세요.\n\n| 파일 | 역할 | 정적 참조 수 | 삭제 분류 |\n|---|---|---:|---|\n'+initial.files.map(f=>`| [${f.path}](../../${encodeDocPath(f.path)}) | ${f.purpose} | ${f.usedBy.length} | ${f.deletion} |`).join('\n')+'\n');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(analyze(),null,2));console.log('성공: 문서 색인과 분석 스냅샷 생성');
}
