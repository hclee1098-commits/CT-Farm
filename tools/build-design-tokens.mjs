// 웹과 네이티브가 같은 색·글자·터치 크기의 원본을 사용합니다.
import fs from 'node:fs/promises';
const t=JSON.parse(await fs.readFile('packages/design-tokens/tokens.json','utf8'));
const vars=mode=>Object.entries(t[mode]).map(([k,v])=>`  --ct-${k}: ${v};`).join('\n');
await fs.writeFile('apps/web/src/app/starter/design-tokens.css',`/* 자동 생성: packages/design-tokens/tokens.json */\n.starter-root {\n${vars('light')}\n  --ct-touch: ${t.touchMin}px;\n}\n@media (prefers-color-scheme: dark) {\n .starter-root[data-theme="system"] {\n${vars('dark')}\n }\n}\n`);
console.log('공통 디자인 토큰 → 웹 CSS 생성');
const icons=JSON.parse(await fs.readFile('packages/design-tokens/icons.json','utf8'));
await fs.writeFile('apps/web/src/app/starter/_components/nav-paths.ts','// 자동 생성: packages/design-tokens/icons.json\nexport const navPaths='+JSON.stringify(icons,null,2)+' as const;\n');
