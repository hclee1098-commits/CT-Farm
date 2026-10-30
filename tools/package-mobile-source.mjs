// 기존 서버/환경파일 없이 빌드 소스를 전달합니다. 앱·공개 토큰만 allowlist로 복사합니다.
import fs from 'node:fs/promises';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomBytes,createHash} from 'node:crypto';
const exec=promisify(execFile),root=process.cwd(),dir=path.join(root,'verification/runtime/ui-mobile-source-'+randomBytes(6).toString('hex'));await fs.mkdir(dir,{recursive:true});
for(const name of ['app','src','assets','plugins'])await fs.cp('apps/mobile/'+name,path.join(dir,name),{recursive:true});
for(const name of ['package.json','package-lock.json','tsconfig.json','expo-env.d.ts','app.config.ts','eas.json','.env.example'])await fs.copyFile('apps/mobile/'+name,path.join(dir,name));
await fs.mkdir(path.join(dir,'src/generated'),{recursive:true});for(const name of ['tokens','icons'])await fs.copyFile('packages/design-tokens/'+name+'.json',path.join(dir,'src/generated',name+'.json'));
for(const [file,from,to] of [['ui.tsx','../../../packages/design-tokens/tokens.json','./generated/tokens.json'],['Icon.tsx','../../../packages/design-tokens/icons.json','./generated/icons.json']]){const p=path.join(dir,'src',file);await fs.writeFile(p,(await fs.readFile(p,'utf8')).replace(from,to));}
await fs.writeFile(path.join(dir,'metro.config.cjs'),"const {getDefaultConfig}=require('expo/metro-config');module.exports=getDefaultConfig(__dirname);\n");
await fs.writeFile(path.join(dir,'.easignore'),'node_modules/\n.expo/\nandroid/\nios/\ndist/\n.env\n.env.*\n*.keystore\n*.jks\n*.p12\n*.mobileprovision\n');
await fs.writeFile(path.join(dir,'README.txt'),'CT-Farm 별도 React Native 앱 빌드 소스입니다. APK/IPA가 아닙니다.\nNode 24.3 이상 호환 버전에서 npm ci --workspaces=false 후 설정하세요.\n.env.example의 공개 API 주소를 .env.local에 설정합니다. 비밀키를 넣지 마세요.\n기존 DB/업로드/웹/API 환경파일은 포함하지 않았습니다.\nAndroid SDK 37 / build-tools 37.0.0 / NDK 27.1.12297006, iOS는 Mac/Xcode/서명이 필요합니다.\nEAS 원격 업로드/서명은 별도 계정·승인·검증이 필요합니다. 개발 키로 운영 배포하지 마세요.\n');
await fs.appendFile(path.join(dir,'README.txt'),'보안 검토 미완료: 생성 시점 모바일 npm audit은 Expo CLI Zod3/deepmerge 영향 8개 패키지(높음3/낮음5)를 보고했습니다.\n개발 서버는 localhost만 사용하고 신뢰할 수 없는 설정/플러그인을 실행하지 마세요. 운영 배포 전 호환 보안 대응이 필요합니다.\n실제 카메라/보안 저장소/기기 UI/Android APK/iOS 바이너리는 아직 검증하지 않았습니다.\n');
const names=await fs.readdir(dir);if(names.some(n=>n.startsWith('.env')&&n!=='.env.example'))throw Error('PRIVATE_ENV_INCLUDED');
await fs.mkdir('artifacts',{recursive:true});const artifact=path.join(root,'artifacts/ct-farm-mobile-source-20261030.zip');await exec('tar.exe',['-a','-cf',artifact,...names],{cwd:dir,windowsHide:true});
// ZIP 생성 후 검사에서만 기존 모바일 의존성을 연결합니다. ZIP에는 들어가지 않습니다.
await fs.symlink(path.join(root,'apps/mobile/node_modules'),path.join(dir,'node_modules'),'junction');
const result={sourceDirectory:dir,artifact:'artifacts/ct-farm-mobile-source-20261030.zip',sha256:createHash('sha256').update(await fs.readFile(artifact)).digest('hex'),privateEnvironmentIncluded:false,nativeBinary:false,sharedTokenCopy:'generated from canonical JSON; original workspace app keeps shared references'};
await fs.writeFile('.starter-state/mobile-source-package.json',JSON.stringify(result));await fs.writeFile('verification/ui-mobile/source-package.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,sourceDirectory:'verification/runtime/(generated standalone project)'}));
