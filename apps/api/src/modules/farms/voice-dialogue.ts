// 허용된 농작업만 다루는 결정적 대화. 제품·사용량·농장을 추측하지 않습니다.
export type VoiceFarm={id:string;name:string;crop:string};
export type VoiceTask={id:string;farmId:string;title:string;version:number};
export type VoiceDraft={phase:'ASK'|'CONFIRM'|'CONFIRMED'|'CANCELLED'|'SAVED';action?:'PESTICIDE'|'WATER'|'SCHEDULE'|'REPORT';taskId?:string;taskVersion?:number;workDate?:string;farmId?:string;product?:string;productUnknown?:boolean;question:string;resultId?:string};
export function koreanDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function relativeDate(base:string,offset:number){const d=new Date(base+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function voiceTurn(previous:VoiceDraft,text:string,farms:VoiceFarm[],today:string,tasks:VoiceTask[]=[]):VoiceDraft{
 const d={...previous};const t=text.trim().replace(/[.!?。]/g,'');
 if(['SAVED','CANCELLED'].includes(d.phase))return d;
 if(/^(취소(해|해줘|할게)?|그만|중단)(요)?$/.test(t))return {...d,phase:'CANCELLED',question:'취소했어요. 기록은 저장하지 않았어요.'};
 if(/다시\s*말할게/.test(t))return {phase:'ASK',question:'무슨 작업을 하셨거나 알려 드릴까요?'};
 if(d.phase==='CONFIRM'&&/^(응|네|예|저장해|저장|맞아|확인)$/.test(t))return {...d,phase:'CONFIRMED',question:'확인한 내용을 저장하고 있어요.'};
 if(d.phase==='CONFIRM'&&/^(아니|아니요)$/.test(t))return {...d,phase:'ASK',question:d.action==='REPORT'?'다른 담당 작업을 골라 주세요.':'어떤 내용을 바꿀까요? 날짜나 농장 이름을 말씀해 주세요.'};
 if(/(내\s*할\s*일|담당\s*작업)/.test(t)&&!t.includes('끝'))return {...d,phase:'ASK',question:tasks.length?'아래 담당 작업을 골라 주세요. 완료 보고는 선택한 뒤 확인받습니다.':'현재 접근 가능한 담당 작업이 없습니다.'};
 if(/작업.*(끝|완료)/.test(t)||t.startsWith('작업확인:'))d.action='REPORT';
 if(d.action==='REPORT'){
  const matches=tasks.filter(task=>t===`작업확인:${task.id}`||t===task.title||t===`${farms.find(f=>f.id===task.farmId)?.name} ${task.title}`);
  if(matches.length===1){const task=matches[0]!;return {...d,taskId:task.id,taskVersion:task.version,farmId:task.farmId,phase:'CONFIRM',question:`${farms.find(f=>f.id===task.farmId)?.name}, ${task.title} 작업을 완료했다고 보고할까요? 관리자가 결과를 확인합니다.`};}
  return {...d,phase:'ASK',question:tasks.length?'어느 담당 작업을 마치셨나요? 아래 작업을 골라 주세요.':'완료 보고할 담당 작업이 없습니다.'};
 }
 let corrected=false;
 if(t.includes('어제')){d.workDate=relativeDate(today,-1);corrected=true;}else if(t.includes('내일')){d.workDate=relativeDate(today,1);corrected=true;}else if(t.includes('오늘')){d.workDate=today;corrected=true;}
 if(/농약/.test(t)){d.action='PESTICIDE';corrected=true;}else if(/물.*(알려|기억|일정|하라고|주라고)/.test(t)){d.action='SCHEDULE';corrected=true;}else if(/물.*(줬|주었|주기|줬어)/.test(t)){d.action='WATER';corrected=true;}
 const farmText=t.includes('말고')?t.split('말고').at(-1)!.trim():t;
 const matches=t.startsWith('농장확인:')?farms.filter(f=>t===`농장확인:${f.id}`):farms.filter(f=>f.name===farmText||farmText.includes(f.name));
 if(matches.length===1){d.farmId=matches[0]!.id;corrected=true;}else if(matches.length>1)return {...d,farmId:undefined,phase:'ASK',question:'이름이 비슷한 농장이 있어요. 아래 농장 중 하나를 골라 주세요.'};
 if(!d.action)return {...d,phase:'ASK',question:'오늘 한 작업인가요, 앞으로 알려 드릴 일인가요? 물주기나 농약 사용을 말씀해 주세요.'};
 if(!d.workDate)return {...d,phase:'ASK',question:'언제 한 작업인가요? 오늘, 어제, 내일 중에서 말씀해 주세요.'};
 if(!d.farmId||!farms.some(f=>f.id===d.farmId))return {...d,phase:'ASK',question:'어느 농장에서 하셨거나 할 일인가요? 농장 이름을 말씀해 주세요.'};
 if(d.action==='PESTICIDE'&&!d.product&&!d.productUnknown){
  if(previous.question==='어떤 농약을 사용하셨어요?'&&!corrected){if(/모르|나중|미확인/.test(t))d.productUnknown=true;else if(t&&t.length<=120&&!/^(응|네|예)$/.test(t))d.product=t;}
  if(!d.product&&!d.productUnknown)return {...d,phase:'ASK',question:'어떤 농약을 사용하셨어요?'};
 }
 const farm=farms.find(f=>f.id===d.farmId)!;
 return {...d,phase:'CONFIRM',question:`${d.productUnknown?'약 봉지 사진이나 이름은 나중에 추가할 수 있어요. ':''}${d.workDate}, ${farm.name}, ${d.action==='PESTICIDE'?`농약 사용 (${d.productUnknown?'제품명 미확인':d.product})`:d.action==='SCHEDULE'?'물주기 일정':'물주기 기록'}입니다. ${d.action==='PESTICIDE'?'사용량·단위는 미확인입니다. ':''}이대로 저장할까요?`};
}
export function voicePayload(d:VoiceDraft,farm:VoiceFarm):{kind:'TASK';data:{title:string;dueDate:string;status:string;memo:string}}|{workDate:string;title:string;content:string}{
 if(d.phase!=='CONFIRMED'||!d.action||!d.workDate||d.farmId!==farm.id)throw Error('CONFIRMATION_REQUIRED');
 if(d.action==='REPORT')throw Error('TASK_REPORT_SEPARATE_ACTION');
 if(d.action==='SCHEDULE')return {kind:'TASK' as const,data:{title:'물주기',dueDate:d.workDate,status:'TODO',memo:'음성으로 확인한 일정'}};
 return {workDate:d.workDate,title:d.action==='PESTICIDE'?'농약 사용 사실 · 정보 보완 필요':'물주기',content:d.action==='PESTICIDE'?`농약 사용 사실 기록. 작물: ${farm.crop}. 제품명: ${d.productUnknown?'미확인':d.product}. 사용량: 미확인. 단위: 미확인. 필지: 미확인(농장 단위 기록). 추가 확인 필요. 농약 처방·안전 사용 확인 기록이 아닙니다.`:'물주기 작업을 했습니다.'};
}
