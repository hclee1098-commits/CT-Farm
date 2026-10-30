"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../_lib/auth';
import {getErrorMessage} from '../_lib/api';
type Photo={id:string;fileId:string;caption:string;file:{originalName:string}};
export function DiaryPhotos({farmId,diaryId}:{farmId:string;diaryId:string}){
  const {request,authorizedFetch}=useAuth();
  const [open,setOpen]=useState(false),[items,setItems]=useState<Photo[]>([]),[file,setFile]=useState<File|null>(null),[caption,setCaption]=useState(''),[uploaded,setUploaded]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[preview,setPreview]=useState<{url:string;caption:string}|null>(null);
  const objectUrl=useRef<string|null>(null);
  const load=useCallback(async()=>setItems(await request<Photo[]>(`/farms/${farmId}/diary/${diaryId}/photos`)),[request,farmId,diaryId]);
  useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(e){setError(getErrorMessage(e));}finally{setBusy(false);}};
  return <div><button disabled={busy} onClick={()=>{setOpen(!open);if(!open)void run(load);else{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;setPreview(null);}}}>{open?'사진 닫기':'사진 등록·조회'}</button>
    {open&&<section aria-label="영농일지 사진"><p>사진 연결을 해제해도 원본 파일은 파일 관리 화면에 남습니다.</p>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      <form onSubmit={e=>{e.preventDefault();void run(async()=>{
        let fileId=uploaded;
        if(!fileId){if(!file)throw new Error('사진을 선택해 주세요.');if(file.size>5*1024*1024)throw new Error('사진은 5MB 이하여야 합니다.');const data=new FormData();data.append('file',file);fileId=(await request<{id:string}>('/files',{method:'POST',body:data})).id;setUploaded(fileId);}
        await request(`/farms/${farmId}/diary/${diaryId}/photos`,{method:'POST',body:JSON.stringify({fileId,caption})});setUploaded(null);setFile(null);setCaption('');await load();setMessage('사진을 연결했습니다.');
      });}}><fieldset disabled={busy} className="farm-fields"><label>사진 (JPEG·PNG·WebP, 최대 5MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{setFile(e.target.files?.[0]??null);setUploaded(null);setMessage('');}}/></label><label>사진 설명<input maxLength={200} value={caption} onChange={e=>setCaption(e.target.value)}/></label><button type="submit">{uploaded?'업로드한 사진 연결 재시도':'사진 업로드·연결'}</button></fieldset></form>
      {uploaded&&<p>파일 업로드는 완료됐습니다. 연결 실패 시 재시도하세요. 원본은 파일 관리 화면에도 있습니다.</p>}
      {!items.length&&<p>연결한 사진이 없습니다.</p>}{items.map(photo=><div key={photo.id} className="farm-item"><p>{photo.caption||photo.file.originalName}</p><button disabled={busy} onClick={()=>void run(async()=>{
        const response=await authorizedFetch(`/files/${photo.fileId}/thumbnail`);if(!response.ok)throw new Error('사진을 불러오지 못했습니다.');const blob=await response.blob();if(!blob.type.startsWith('image/'))throw new Error('사진 응답이 올바르지 않습니다.');if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const url=URL.createObjectURL(blob);objectUrl.current=url;setPreview({url,caption:photo.caption||photo.file.originalName});
      })}>사진 보기</button><button disabled={busy} onClick={()=>{if(!window.confirm('사진 연결을 해제할까요? 원본은 남습니다.'))return;void run(async()=>{await request(`/farms/${farmId}/diary/${diaryId}/photos/${photo.id}`,{method:'DELETE'});await load();setMessage('사진 연결을 해제했습니다.');});}}>연결 해제</button></div>)}
      {preview&&<figure><img src={preview.url} alt={preview.caption} style={{maxWidth:'100%',height:'auto'}}/><figcaption>{preview.caption}</figcaption></figure>}
    </section>}
  </div>;
}
