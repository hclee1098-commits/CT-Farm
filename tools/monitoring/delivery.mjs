// 외부 발송은 명시적 설정 후 운영자가 호출합니다. 공급자 접수와 수신 확인은 다릅니다.
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import {withIncidentState} from './incidents.mjs';
export function enqueueTransitions(dir,env,transitions){return withIncidentState(dir,env,state=>{
 state.deliveries??=[];for(const t of transitions){
  const key=t.incidentId+':'+t.transition;if(state.deliveries.some(x=>x.key===key))continue;
  if(!/^[a-f0-9-]{36}$/i.test(t.incidentId)||!['OPEN','RECOVERED'].includes(t.transition)||!['api','web','database','redis','disk','backup','deployment','collector'].includes(t.service))throw Error('INVALID_TRANSITION');
  // 미전송 항목을 지우지 않고 한도에서 명시적으로 실패합니다.
  if(state.deliveries.length>=300)throw Error('DELIVERY_CAPACITY');
  state.deliveries.push({key,service:t.service,transition:t.transition,status:'PENDING',attempts:0,nextAt:0,leaseUntil:0});
 }return state.deliveries.length;
});}
export async function dispatchOne(dir,env,adapter,{now=Date.now(),maxAttempts=5}={}){
 if(!adapter)return {status:'NOT_CONFIGURED'};
 const claim=withIncidentState(dir,env,state=>{for(const x of state.deliveries||[])if(x.status==='SENDING'&&x.leaseUntil<=now&&x.attempts>=maxAttempts)x.status='FAILED';const row=(state.deliveries||[]).find(x=>['PENDING','RETRY','SENDING'].includes(x.status)&&x.nextAt<=now&&x.leaseUntil<=now&&x.attempts<maxAttempts);if(!row)return null;row.status='SENDING';row.lease=crypto.randomUUID();row.leaseUntil=now+60000;row.attempts++;return {...row};});
 if(!claim)return {status:'IDLE'};
 let accepted=false;try{await adapter.send({key:claim.key,environment:env,service:claim.service,transition:claim.transition});accepted=true;}catch{}
 return withIncidentState(dir,env,state=>{const row=state.deliveries.find(x=>x.key===claim.key);if(row.lease!==claim.lease)throw Error('DELIVERY_LEASE_LOST');row.leaseUntil=0;row.status=accepted?'PROVIDER_ACCEPTED':row.attempts>=maxAttempts?'FAILED':'RETRY';row.nextAt=now+Math.min(3600000,1000*2**row.attempts);row.updatedAt=new Date(now).toISOString();return {status:row.status,attempts:row.attempts,actualReceiptVerified:false};});
}
export function smtpAdapter(env=process.env){
 if(env.MONITOR_DELIVERY!=='SMTP')return null;
 if(!env.MONITOR_SMTP_HOST||!env.MONITOR_ALERT_FROM||!env.MONITOR_ALERT_TO)throw Error('SMTP_CONFIGURATION');
 const transport=nodemailer.createTransport({host:env.MONITOR_SMTP_HOST,port:Number(env.MONITOR_SMTP_PORT||465),secure:env.MONITOR_SMTP_PORT!=='587',requireTLS:true,auth:env.MONITOR_SMTP_USER?{user:env.MONITOR_SMTP_USER,pass:env.MONITOR_SMTP_PASSWORD}:undefined,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
 return {send:async event=>{const result=await transport.sendMail({from:env.MONITOR_ALERT_FROM,to:env.MONITOR_ALERT_TO,subject:`CT-Farm ${event.environment} ${event.service} ${event.transition}`,text:`서비스 상태 전환: ${event.service} ${event.transition}`,messageId:`<${crypto.createHash('sha256').update(event.key).digest('hex')}@ctfarm.invalid>`});if(!result.accepted?.length)throw Error('SMTP_NOT_ACCEPTED');}};
}
export function webhookAdapter({url,token},request=fetch){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!token||token.length<32)throw Error('ONCALL_CONFIGURATION');
 return {send:async event=>{const response=await request(parsed,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':event.key},body:JSON.stringify(event)});if(!response.ok)throw Error('ONCALL_NOT_ACCEPTED');}};
}
