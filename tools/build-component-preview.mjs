import {build} from 'esbuild';
import path from 'node:path';
import {root} from './analyze-project.mjs';
await build({entryPoints:[path.join(root,'tools/dev-portal/components.tsx')],bundle:true,outfile:path.join(root,'.starter-state/component-preview.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:true});
console.log('공통 컴포넌트 체험 번들 생성 완료');
