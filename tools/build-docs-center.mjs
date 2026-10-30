// 공개 문서는 이 고정 allowlist로만 빌드합니다. 디스크 임의 조회 API는 없습니다.
import fs from 'node:fs';
import {build} from 'esbuild';
const names=['시작','기능-설명','설치-운영','시스템-구조','개발자-안내','API-데이터-목록','외부-연동','브랜드-가이드','문서-관리','공통기반-검증','4차-모바일과-운영','5차-검증과-권한확장','6차-음성과-실행복구','모바일앱과-디자인'];
const categories=['시작하기','사용 설명','시작하기','개발과 구조','개발과 구조','개발과 구조','외부 연동','브랜드','문서 관리','공통 기반 검증','4차 개발·검증','5차 개발·검증','6차 음성·협업·복구','모바일 앱·디자인'];
const documents=names.map((name,i)=>{const path=`docs/09-CT-Farm-안내/${name}.md`,text=fs.readFileSync(path,'utf8');return {path,title:text.match(/^# (.+)$/m)[1],text,category:categories[i],modified:fs.statSync(path).mtime.toISOString(),status:i===6?'외부 연동 대기':'안내 · 검증 범위는 본문 참조'};});
fs.mkdirSync('apps/web/public/docs-center',{recursive:true});
await build({entryPoints:['tools/docs-center/app.js'],outfile:'apps/web/public/docs-center/app.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,define:{CT_FARM_DOCUMENTS:JSON.stringify(documents)},legalComments:'eof'});
for(const name of ['index.html','style.css'])fs.copyFileSync('tools/docs-center/'+name,'apps/web/public/docs-center/'+name);
fs.writeFileSync('apps/web/public/docs-center/catalog.json',JSON.stringify(documents.map(({text,...d})=>d),null,2));
console.log(`기존 렌더러 재사용: 공개 안내 ${documents.length}개 빌드`);
