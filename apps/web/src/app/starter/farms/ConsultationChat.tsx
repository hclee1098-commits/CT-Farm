"use client";
import {useEffect,useState} from 'react';
import {useAuth} from '../_lib/auth';
type Source={id:string;title:string;url:string;summary:string;scope:string;reviewedAt:string};
type Turn={id:string;question:string;answer:string|null;status:string;mode:string;sources:Source[];usageTokens:number;createdAt:string};
type Page={items:Turn[];totalPages:number;modelConfigured:boolean};
export function ConsultationChat({farmId}:{farmId:string}){
  const {request}=useAuth();const [items,setItems]=useState<Turn[]>([]),[question,setQuestion]=useState(''),[mode,setMode]=useState<'REFERENCE'|'MODEL'>('REFERENCE'),[allowExternal,setAllowExternal]=useState(false),[modelConfigured,setConfigured]=useState(false),[page,setPage]=useState(1),[pages,setPages]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key,setKey]=useState('');
  async function load(){const data=await request<Page>(`/farms/${farmId}/consultations?page=${page}`);setItems(data.items);setPages(data.totalPages);setConfigured(data.modelConfigured);}
  useEffect(()=>{let active=true;request<Page>(`/farms/${farmId}/consultations?page=${page}`).then(data=>{if(active){setItems(data.items);setPages(data.totalPages);setConfigured(data.modelConfigured);}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'상담 기록을 불러오지 못했습니다.');});return()=>{active=false;};},[farmId,page,request]);
  async function send(){setBusy(true);setError('');try{const requestKey=key||crypto.randomUUID();setKey(requestKey);await request<Turn>(`/farms/${farmId}/consultations`,{method:'POST',body:JSON.stringify({requestKey,question,mode,allowExternal})});setQuestion('');setKey('');await load();}catch(e){setError(e instanceof Error?e.message:'상담을 처리하지 못했습니다.');}finally{setBusy(false);}}
  const labels:Record<string,string>={PENDING:'처리 중 · 재전송하지 마세요',ANSWERED:'모델 참고 답변 · 전문가 검증 전',REFERENCE:'자료 안내 · 생성형 AI 답변 아님',NEEDS_REVIEW:'안전 검토 필요',FAILED:'응답 실패 · 성공 처리되지 않음'};
  return <section className="starter-card"><h2>농사 상담 · 농장별 기록</h2><p>작물·작기·최근 일지·일정·센서 점검 요약을 연결합니다. 자료 안내 모드는 외부 AI를 호출하지 않습니다. 제공 출처는 공식 포털 탐색 경로이며 개별 약제나 상세 재배법의 검증 근거는 아닙니다.</p>
    {error&&<p role="alert">{error}</p>}<form onSubmit={e=>{e.preventDefault();void send();}}><fieldset disabled={busy} className="farm-fields">
      <label className="farm-wide">농사 질문<textarea required minLength={2} maxLength={2000} rows={4} value={question} onChange={e=>{setQuestion(e.target.value);setKey('');}}/></label>
      <label>상담 방식<select value={mode} onChange={e=>{setMode(e.target.value as 'REFERENCE'|'MODEL');setKey('');}}><option value="REFERENCE">자료 안내 (AI 키 없이 사용)</option><option value="MODEL" disabled={!modelConfigured}>AI 모델 상담 {modelConfigured?'':'(서버 설정 필요)'}</option></select></label>
      {mode==='MODEL'&&<label className="farm-wide"><span><input type="checkbox" checked={allowExternal} onChange={e=>{setAllowExternal(e.target.checked);setKey('');}}/> 질문·농장 요약·최근 모델 대화 요약을 외부 OpenAI 서비스로 보내는 데 동의합니다.</span><small>서버는 주소·좌표·계정 정보·장치 키를 제외합니다. 직접 입력한 질문·일지·기존 대화의 개인정보는 전송될 수 있으니 먼저 확인하세요. 최근 모델 답변 3개까지만 이어받습니다.</small></label>}
      <button type="submit">{busy?'상담 처리 중…':'질문 보내기'}</button>
    </fieldset></form><button disabled={busy} onClick={()=>void load().catch(e=>setError(e instanceof Error?e.message:'조회 실패'))}>대화 기록 새로고침</button>
    {items.length===0&&<p>아직 상담 기록이 없습니다.</p>}{[...items].reverse().map(turn=><article key={turn.id} className="farm-item"><h3>질문: {turn.question}</h3><p>{labels[turn.status]??turn.status}</p><p className="farm-content">{turn.answer??'응답을 기다리고 있습니다. 처리 중인 요청을 반복 제출하지 마세요.'}</p><small>{new Date(turn.createdAt).toLocaleString('ko-KR')} · 공급자 보고 토큰 {turn.usageTokens}</small>
      <ul>{turn.sources.map(source=><li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p>{source.scope} · 확인일 {source.reviewedAt}</p></li>)}</ul>
    </article>)}<div className="starter-actions"><button disabled={busy||page<=1} onClick={()=>setPage(page-1)}>이전 상담</button><span>{page} / {pages}</span><button disabled={busy||page>=pages} onClick={()=>setPage(page+1)}>다음 상담</button></div>
  </section>;
}
