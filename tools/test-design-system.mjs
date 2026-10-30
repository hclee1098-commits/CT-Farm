import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import sharp from 'sharp';
const tokens=JSON.parse(fs.readFileSync('packages/design-tokens/tokens.json','utf8'));
function lum(hex){return hex.match(/[a-f\d]{2}/gi).map(h=>parseInt(h,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);}
function contrast(a,b){return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);}
test('공통 주요 문자·버튼 대비는 밝은/어두운 토큰 모두 4.5 이상',()=>{for(const mode of ['light','dark']){const t=tokens[mode];for(const [a,b] of [['text','surface'],['muted','surface'],['primary','background'],['danger','surface']])assert(contrast(t[a],t[b])>=4.5,mode+': '+a+'/'+b);assert(tokens.touchMin>=48);}});
test('웹 생성 CSS가 공통 원본 토큰과 일치',()=>{const css=fs.readFileSync('apps/web/src/app/starter/design-tokens.css','utf8');for(const mode of ['light','dark'])for(const [k,v] of Object.entries(tokens[mode]))assert(css.includes(`--ct-${k}: ${v};`));});
test('네이티브 앱 아이콘은 1024px 불투명 PNG',async()=>{const m=await sharp('apps/mobile/assets/icon.png').metadata();assert.equal(m.width,1024);assert.equal(m.height,1024);assert.equal(m.hasAlpha,false);});
test('Android 생성 설정: release 개발 키 차단·백업 제외·마이크 권한 제거 지시',()=>{const gradle=fs.readFileSync('apps/mobile/android/app/build.gradle','utf8'),manifest=fs.readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml','utf8');assert.match(gradle,/release\s*\{[\s\S]*?signingConfig null/);const audio=[...manifest.matchAll(/<uses-permission[^>]*android.permission.RECORD_AUDIO[^>]*>/g)];assert(audio.every(m=>m[0].includes('tools:node="remove"')));assert.match(manifest,/android:allowBackup="false"/);assert.match(manifest,/secure_store_backup_rules/);});
