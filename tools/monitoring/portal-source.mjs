import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {environments,loadEvents,summarize,httpsURL,safeEvent} from './core.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function snapshots({env='ALL',minutes=60,dir=process.env.MONITOR_DIR||path.join(root,'.starter-state/monitoring'),source=process.env}={}){
 if(![...environments,'ALL'].includes(env))throw Error('ENVIRONMENT');
 return Promise.all((env==='ALL'?environments:[env]).map(async name=>{
  if(name==='LOCAL')return summarize(loadEvents(dir,name),name,minutes);
  const value=source['MONITOR_'+name+'_URL'],token=source['MONITOR_'+name+'_READ_TOKEN'];
  if(!value||!token)return {...summarize([],name,minutes),connection:'not_configured'};
  try{
   const url=new URL('/v1/snapshot',httpsURL(value));url.searchParams.set('environment',name);url.searchParams.set('minutes',String(minutes));
   const response=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(4000)});
   if(!response.ok)throw Error();const body=await response.json();if(body.environment!==name||!Array.isArray(body.events))throw Error();
   // 원격 응답도 재검증하고 허용된 필드만 화면에 전달합니다.
   const combined=[...body.events,...(body.observations||[]),...(body.deployments||[])];const unique=[...new Map(combined.map(e=>{const clean=safeEvent(e,name);return [clean.id,clean];})).values()];
   // 최근 상태 관측도 함께 재검증합니다.
   return {...summarize(unique,name,minutes),connection:'connected'};
  }catch{return {...summarize([],name,minutes),connection:'unreachable'};}
 }));
}
