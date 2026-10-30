import fs from 'node:fs';
import path from 'node:path';
const output='docs/07-기술참고/CT-Farm-문서분류목록.md';
if(!fs.existsSync(output))fs.writeFileSync(output,'# CT-Farm 전체 문서 분류와 보존 판단\n');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):e.name.endsWith('.md')?[dir+'/'+e.name]:[]);
const files=walk('docs');const records=files.map(file=>({path:file,title:fs.readFileSync(file,'utf8').match(/^# (.+)$/m)?.[1]||file,status:file.includes('/08-')?'과거 이력 보관':file.includes('/09-')||file==='docs/README.md'?'현재 안내':file.includes('CT-Farm-개발현황')||file.includes('CT-Farm-2차')?'최신 구현 근거':'기존 상세 참고 · 검증일 확인',decision:file.includes('/09-')?'신규 통합 안내':file.includes('/08-')?'이력 유지 · 현재 완료 근거 아님':'원본 유지 · 최신 안내에서 참조'}));
fs.writeFileSync(output,'# CT-Farm 전체 문서 분류와 보존 판단\n\n기준일: 2026-10-29. Markdown '+files.length+'개를 분류했습니다. 삭제·이동 없이 원본과 링크를 보존하고 현재 안내로 진입점을 통합했습니다. 파일 존재와 검증 완료는 별개입니다.\n\n[현재 안내](../09-CT-Farm-안내/시작.md) · [문서센터](../README.md)\n\n| 문서 | 분류 | 정리 판단 |\n|---|---|---|\n'+records.map(d=>`| [${d.title}](${path.posix.relative(path.posix.dirname(output),d.path)}) | ${d.status} | ${d.decision} |`).join('\n')+'\n');
console.log(`전체 문서 ${files.length}개 분류, 삭제 0개`);
