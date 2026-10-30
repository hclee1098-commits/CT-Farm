// 로컬 전용 전체 STAGING. 기존 compose/.env/볼륨을 참조하거나 정리하지 않습니다.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import https from 'node:https';
import sharp from 'sharp';
const exec=promisify(execFile),id=randomBytes(6).toString('hex'),project='ctfarm-round5-'+id,dir='verification/round6/staging-'+id,envFile='.starter-state/round6-staging-'+id+'.env';
await fs.mkdir(dir,{recursive:true});await fs.writeFile(envFile,`ROUND5_RUN_ID=${id}\nROUND5_DB_PASSWORD=${randomBytes(24).toString('hex')}\nROUND5_JWT_SECRET=${randomBytes(48).toString('hex')}\nROUND5_MFA_KEY=${randomBytes(32).toString('hex')}\n`,{flag:'wx',mode:0o600});
const compose=['compose','--env-file',envFile,'-f','deploy/round5/compose.local.yaml'];const checks=[];
async function command(label,args,timeout=600000){const startedAt=new Date().toISOString();let result,code=0;try{result=await exec('docker',args,{windowsHide:true,timeout,maxBuffer:8*1024*1024});}catch(e){result=e;code=typeof e.code==='number'?e.code:1;}await fs.writeFile(dir+'/'+label+'.log',(result.stdout||'')+'\n'+(result.stderr||''));checks.push({label,command:['docker',...args],startedAt,endedAt:new Date().toISOString(),exitCode:code,log:dir+'/'+label+'.log'});await fs.writeFile(dir+'/results.json',JSON.stringify({project,checks,localTlsOnly:true,productionDeployed:false},null,2));console.log(label+': exit '+code);if(code)throw Error(label+' failed; see safe raw log');return result.stdout;}
let started=false;
try{
 await command('config',[...compose,'config','--quiet']);
 await command('build',[...compose,'build']);
 await command('up',[...compose,'up','-d','--wait','--wait-timeout','120']);started=true;
 const proxy=(await command('proxy-id',[...compose,'ps','-q','proxy'])).trim();if(!/^[a-f0-9]{64}$/.test(proxy))throw Error('PROXY_ID');
 const cert=await command('local-ca',['exec',proxy,'cat','/data/caddy/pki/authorities/local/root.crt']);
 const request=(route,options={})=>new Promise((resolve,reject)=>{const req=https.request('https://localhost:18443'+route,{ca:cert,...options},r=>{let data='';r.on('data',b=>data+=b);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,data}));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('TLS_TIMEOUT')));if(options.body)req.write(options.body);req.end();});
 let ready=false;for(let i=0;i<50;i++){try{if((await request('/health/ready')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('STAGING_NOT_READY');
 const web=await request('/starter'),email='staging-'+id+'@example.test',password='Synthetic-local-only-12345';if(web.status!==200)throw Error('WEB_STATUS');
 const register=await request('/api/v1/auth/web/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://localhost:18443'},body:JSON.stringify({email,password,name:'격리 시험'})});if(register.status!==201)throw Error('REGISTER_STATUS_'+register.status);
 const cookie=(register.headers['set-cookie']||[]).join(';');if(!/Secure/i.test(cookie)||!/HttpOnly/i.test(cookie)||!/__Host-refresh_token/.test(cookie))throw Error('SECURE_COOKIE');
 const login=await request('/api/v1/auth/web/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://localhost:18443'},body:JSON.stringify({email,password})});if(login.status!==200)throw Error('LOGIN_STATUS');
 const accessToken=JSON.parse(login.data).data.accessToken;
 const missingOrigin=await request('/api/v1/auth/web/refresh',{method:'POST',headers:{Cookie:cookie.split(';')[0]}});if(missingOrigin.status!==403)throw Error('CSRF_ORIGIN_REQUIRED');
 const bytes=await sharp({create:{width:24,height:24,channels:3,background:'green'}}).png().toBuffer(),boundary='ctfarm-'+id;const uploadBody=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 const upload=await request('/api/v1/files',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'multipart/form-data; boundary='+boundary},body:uploadBody});if(upload.status!==201)throw Error('UPLOAD_STATUS_'+upload.status);
 const fileId=JSON.parse(upload.data).data.id,download=await request(`/api/v1/files/${fileId}/download`,{headers:{Authorization:'Bearer '+accessToken}});if(download.status!==200)throw Error('DOWNLOAD_STATUS');
 const badOrigin=await request('/api/v1/auth/web/refresh',{method:'POST',headers:{Origin:'https://untrusted.invalid',Cookie:cookie.split(';')[0]}});if(badOrigin.status!==403)throw Error('ORIGIN_NOT_REJECTED');
 const data={at:new Date().toISOString(),localTlsVerified:true,publicTlsVerified:false,readiness:200,web:web.status,register:register.status,login:login.status,secureHttpOnlyHostCookie:true,untrustedOrigin:badOrigin.status,missingOrigin:missingOrigin.status,upload:upload.status,authenticatedDownload:download.status,rawAudioTested:false};await fs.writeFile(dir+'/http.json',JSON.stringify(data,null,2));console.log('로컬 TLS·등록·로그인·보안 쿠키·Origin·업로드 검증 통과');
 await command('restart',[...compose,'restart','api','web']);
 async function waitReady(){for(let i=0;i<100;i++){try{if((await request('/health/ready')).status===200&&(await request('/starter')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('RESTART_NOT_READY');}await waitReady();
 const refresh=await request('/api/v1/auth/web/refresh',{method:'POST',headers:{Origin:'https://localhost:18443',Cookie:cookie.split(';')[0]}});if(refresh.status!==200)throw Error('REFRESH_AFTER_RESTART');
 const previous='ctfarm-round5-9c5cc224ddbd-api:latest';const oldId=(await command('previous-image',['image','inspect','--format','{{.Id}}',previous])).trim();const currentId=(await command('current-image',['image','inspect','--format','{{.Id}}',project+'-api:latest'])).trim();if(!/^sha256:[a-f0-9]{64}$/.test(oldId)||!/^sha256:[a-f0-9]{64}$/.test(currentId))throw Error('IMAGE_ID');const override='.starter-state/round6-rollback-'+id+'.yaml';
 try{for(const [label,image] of [['rollback',oldId],['rollforward',currentId]]){await fs.writeFile(override,`services:\n  api:\n    image: ${image}\n`);await command(label,[...compose,'-f',override,'up','-d','--no-build','--no-deps','api']);await waitReady();const me=await request('/api/v1/auth/me',{headers:{Authorization:'Bearer '+accessToken}});if(me.status!==200)throw Error('SESSION_AFTER_'+label);}}finally{await fs.unlink(override);}
 await fs.writeFile(dir+'/restart-rollback.json',JSON.stringify({restartVerified:true,refreshAfterRestart:refresh.status,rollbackImageId:oldId,rollforwardImageId:currentId,authenticatedMeAfterBoth:200,databaseRolledBack:false,scope:'local compatible schema only, not production rollback'},null,2));
}finally{
 try{const raw=await exec('docker',['ps','-aq','--filter','label=com.docker.compose.project='+project],{windowsHide:true});const ids=raw.stdout.trim().split(/\s+/).filter(Boolean);for(const container of ids){if(!/^[a-f0-9]{12,64}$/.test(container))throw Error('RESOURCE_ID');const label=await exec('docker',['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container],{windowsHide:true});if(label.stdout.trim()!==project)throw Error('RESOURCE_OWNER');await exec('docker',['stop','--time','3',container],{windowsHide:true});}await fs.writeFile(dir+'/cleanup.json',JSON.stringify({stoppedOwnContainers:ids.length,volumesDeleted:false,sourceServicesChanged:false}));}finally{await fs.unlink(envFile);}
}
