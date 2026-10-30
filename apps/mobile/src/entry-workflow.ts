import type {MobileClient} from './client';
export type EntryDraft={farmId:string;date:string;kind:string;memo:string;requestKey:string;signature:string;savedId?:string;fileId?:string;imageUri?:string;dirty?:boolean;mode:'diary'|'schedule'};
export function entryBody(d:EntryDraft){return d.mode==='diary'?{workDate:d.date,title:d.kind,content:d.memo.trim()||d.kind}:{kind:'TASK',data:{title:d.kind,dueDate:d.date,status:'TODO',memo:d.memo.trim()}};}
// UI와 실제 HTTP 시험이 공유합니다. 사진 실패 시 이미 저장한 일지를 만들지 않습니다.
export async function saveEntry(api:Pick<MobileClient,'request'>,draft:EntryDraft,persist:(d:EntryDraft)=>Promise<void>,upload:(uri:string)=>Promise<{id:string}>){
 if(!draft.farmId||!draft.requestKey)throw Error('농장과 요청 식별자를 확인해 주세요.');
 const body=entryBody(draft),signature=draft.mode+draft.farmId+JSON.stringify(body);
 if(draft.signature!==signature)throw Error('초안 내용이 바뀌었습니다. 저장 여부를 확인한 뒤 새 요청으로 저장해 주세요.');
 let current={...draft};await persist(current);
 if(!current.savedId){const result=await api.request<{id:string}>(`/farms/${current.farmId}/${current.mode==='diary'?'diary':'records'}`,{method:'POST',headers:{'Idempotency-Key':current.requestKey},body:JSON.stringify(body)});current={...current,savedId:result.id};await persist(current);}
 if(current.mode==='diary'&&current.imageUri){
  if(!current.fileId){const file=await upload(current.imageUri);current={...current,fileId:file.id};await persist(current);}
  await api.request(`/farms/${current.farmId}/diary/${current.savedId}/photos`,{method:'POST',body:JSON.stringify({fileId:current.fileId,caption:''})});
 }
 return current;
}
