// Node HTTP 이벤트만 관측합니다. URL·헤더·본문·오류 원문을 읽지 않습니다.
const {Server}=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const environment=process.env.APP_ENV||'LOCAL';const original=Server.prototype.emit;const queue=[];let active=false,lastPrune=0;
async function flush(){try{const items=queue.splice(0,100);const dir=path.join(process.env.MONITOR_DIR||path.resolve(process.cwd(),'../../.starter-state/monitoring'),environment);await fs.mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,'web-http.jsonl');try{const stat=await fs.lstat(file);if(stat.isSymbolicLink())return;if(stat.size>8*1024*1024)await fs.writeFile(file,'',{mode:0o600});}catch{}if(Date.now()-lastPrune>60000){lastPrune=Date.now();try{const lines=(await fs.readFile(file,'utf8')).split('\n').filter(Boolean).filter(line=>{try{return Date.parse(JSON.parse(line).time)>=Date.now()-7*86400000;}catch{return false;}});await fs.writeFile(file,lines.length?lines.join('\n')+'\n':'',{mode:0o600});}catch{}}await fs.appendFile(file,items.map(e=>JSON.stringify(e)).join('\n')+'\n',{mode:0o600});}catch{}finally{active=false;if(queue.length){active=true;setImmediate(flush);}}}
function record(kind){if(!['LOCAL','STAGING','PRODUCTION'].includes(environment)||!['start','stop','failure'].includes(kind))return;const e={id:randomUUID(),time:new Date().toISOString(),environment,service:'web',kind,level:kind==='failure'?'error':'info'};if(/^(sha256:)?[a-f\d]{7,64}$/i.test(process.env.DEPLOY_VERSION||''))e.version=process.env.DEPLOY_VERSION;if(queue.length<500)queue.push(e);if(!active){active=true;setImmediate(flush);}}
process.on('starter-telemetry',record);process.once('SIGTERM',()=>record('stop'));process.once('SIGINT',()=>record('stop'));
if(['LOCAL','STAGING','PRODUCTION'].includes(environment))Server.prototype.emit=function(type,...args){
 if(type==='request'){
  const [req,res]=args,start=process.hrtime.bigint();
  // 상태 확인 요청은 사용자 요청 집계에서 제외합니다.
  if(req.url?.split('?')[0]!=='/api/monitor-health')res.once('finish',()=>{const event={id:randomUUID(),time:new Date().toISOString(),environment,service:'web',kind:'request',level:res.statusCode>=500?'error':res.statusCode>=400?'warn':'info',statusCode:res.statusCode,durationMs:Number(process.hrtime.bigint()-start)/1e6};if(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method))event.method=req.method;if(/^(sha256:)?[a-f\d]{7,64}$/i.test(process.env.DEPLOY_VERSION||''))event.version=process.env.DEPLOY_VERSION;if(queue.length<500)queue.push(event);if(!active){active=true;setImmediate(flush);}});
 }
 return original.call(this,type,...args);
};
