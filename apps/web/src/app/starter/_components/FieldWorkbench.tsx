"use client";
import {useCallback,useEffect,useState,useRef,type FormEvent} from 'react';
import Link from 'next/link';
import {useAuth} from '../_lib/auth';
import {DiaryPhotos} from '../farms/DiaryPhotos';
import {getErrorMessage} from '../_lib/api';
import {readFieldDraft,saveFieldDraft,removeFieldDraft} from '../../../shared/auth/field-drafts';
export function FieldWorkbench({mode}:{mode:'diary'|'schedule'}){
 const {user,loading,request}=useAuth();const [farms,setFarms]=useState<{id:string;name:string}[]>([]),[farmId,setFarmId]=useState(''),[date,setDate]=useState(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),[kind,setKind]=useState('물주기'),[memo,setMemo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<{id:string;farmId:string}|null>(null),[message,setMessage]=useState('');
 const [page,setPage]=useState(1),[totalPages,setTotalPages]=useState(1);const [draftUser,setDraftUser]=useState('');
 const load=useCallback(async()=>{try{const p=await request<{items:{id:string;name:string}[];totalPages:number}>(`/farms?page=${page}`);setFarms(p.items);setTotalPages(p.totalPages);setFarmId(old=>old||p.items[0]?.id||'');}catch{setError('농장 목록을 불러오지 못했습니다. 다시 시도해 주세요.');}},[request,page]);useEffect(()=>{if(user)void load();},[user,load]);
 const pending=useRef<{signature:string;key:string}|null>(null);
 useEffect(()=>{pending.current=null;setMemo('');setFarmId('');setSaved(null);setPage(1);if(!user){setDraftUser('');return;}try{const d=readFieldDraft(sessionStorage,user.id,mode);if(d){setFarmId(d.farmId);setDate(d.date);setKind(d.kind);setMemo(d.memo);pending.current=d.pending;setMessage('이 탭에 남겨 둔 초안을 불러왔습니다. 저장 여부를 확인한 뒤 저장해 주세요.');}}catch{}setDraftUser(user.id);},[user?.id,mode]);
 useEffect(()=>{if(!user||draftUser!==user.id||!memo&&!pending.current)return;try{saveFieldDraft(sessionStorage,user.id,mode,{farmId,date,kind,memo,pending:pending.current});}catch{setError('이 기기에서 초안을 보관할 수 없습니다. 화면을 닫기 전에 내용을 따로 보관해 주세요.');}},[user?.id,draftUser,mode,farmId,date,kind,memo]);
 async function submit(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   if(!farmId)throw Error('농장을 먼저 선택해 주세요.');
   if(!farms.some(f=>f.id===farmId))throw Error('농장 목록 페이지를 이동해 선택한 농장을 다시 확인해 주세요.');
   const body=JSON.stringify(mode==='diary'?{workDate:date,title:kind,content:memo.trim()||kind}:{kind:'TASK',data:{title:kind,dueDate:date,status:'TODO',memo}});
   const signature=mode+farmId+body;
   if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
   try{saveFieldDraft(sessionStorage,user!.id,mode,{farmId,date,kind,memo,pending:pending.current});}catch{};
   const result=await request<{id:string}>(`/farms/${farmId}/${mode==='diary'?'diary':'records'}`,{method:'POST',headers:{'Idempotency-Key':pending.current!.key},body});
   pending.current=null;
   try{removeFieldDraft(sessionStorage,user!.id,mode);}catch{};
   if(mode==='diary'){setSaved({id:result.id,farmId});setMessage('일지를 저장했습니다. 아래에서 사진을 붙일 수 있습니다.');}
   else{setSaved(null);setMessage('일정을 저장했습니다. 농장 상세에서 완료 표시할 수 있습니다.');}
   setMemo('');
  }catch(e){setError(getErrorMessage(e)+' 입력한 내용은 그대로 남아 있습니다.');}finally{setBusy(false);}
 }
 if(loading)return <p role="status">로그인 상태를 확인합니다.</p>;if(!user)return <p><Link href="/starter/login">먼저 로그인해 주세요.</Link></p>;
 return <div className="starter-container farmer-form"><h1>{mode==='diary'?'영농일지 간편 작성':'농작업 일정 등록'}</h1><p>농장·날짜·작업을 고르고 메모를 남겨 주세요. 농장이 많으면 목록 페이지를 이동하세요.</p><nav aria-label="농장 목록 페이지"><button disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)}>이전 농장</button><span>{page} / {totalPages}쪽</span><button disabled={busy||page>=totalPages} onClick={()=>setPage(p=>p+1)}>다음 농장</button></nav>{farmId&&!farms.some(f=>f.id===farmId)&&<p>다른 목록 페이지의 농장이 선택되어 있습니다. 저장 전에 농장을 다시 확인해 주세요.</p>}{error&&<p role="alert" id="work-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {!farms.length&&<p>등록한 농장이 없거나 아직 불러오지 못했습니다. <Link href="/starter/farms">내 농장으로 이동</Link> <button onClick={()=>void load()}>목록 다시 불러오기</button></p>}
 <form onSubmit={submit} aria-describedby={error?'work-error':undefined}><label>농장<select value={farmId} onChange={e=>{setFarmId(e.target.value);setSaved(null);}} required disabled={busy}><option value="">농장을 골라 주세요</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>{mode==='diary'?'작업한 날':'작업할 날'}<input type="date" value={date} onChange={e=>setDate(e.target.value)} required disabled={busy}/></label><label>작업 종류<select value={kind} onChange={e=>setKind(e.target.value)} disabled={busy}>{['물주기','씨뿌리기','모종 옮겨심기','풀 뽑기','비료 주기','병해충 살피기','수확','기타 작업'].map(k=><option key={k}>{k}</option>)}</select></label><label>간단한 메모 (선택)<textarea value={memo} onChange={e=>setMemo(e.target.value)} maxLength={mode==='diary'?5000:2000} disabled={busy} placeholder="예: 오전에 물을 주었어요"/></label><button type="submit" disabled={busy||!farmId}>{busy?'저장 중…':mode==='diary'?'일지 저장':'일정 저장'}</button></form>
 {saved&&<section><h2>방금 쓴 일지에 사진 붙이기</h2><DiaryPhotos farmId={saved.farmId} diaryId={saved.id}/></section>}<p>저장 실패 후 같은 화면에서 같은 내용을 다시 보내면 중복 저장을 막습니다. 화면을 닫거나 내용을 바꾸기 전에는 농장 상세에서 저장 여부를 확인해 주세요. 자동 재전송은 하지 않습니다.</p></div>;
}
