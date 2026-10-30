"use client";
import {useState} from 'react';
import {useAuth} from '../_lib/auth';
type Preview={areaM2:number;boundary:number[][];areaMethod:string};
export function BoundaryImport({farmId,onSaved}:{farmId:string;onSaved:()=>Promise<void>}){
  const {request}=useAuth();const [name,setName]=useState(''),[sourceCrs,setCrs]=useState('EPSG:5179'),[sourceId,setSourceId]=useState(''),[text,setText]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const input=()=>({name,sourceCrs,sourceId,coordinates:text.trim().split(/\r?\n/).filter(Boolean).map(line=>line.trim().split(/[,\s]+/).map(Number))});
  async function run(save:boolean){setBusy(true);setMessage('');try{const data=input();if(save){await request(`/farms/${farmId}/plots/import`,{method:'POST',body:JSON.stringify(data)});await onSaved();setMessage('필지를 저장했습니다. 업로드한 좌표이며 공식 경계 일치 여부는 별도 확인해야 합니다.');setPreview(null);}else setPreview(await request<Preview>('/maps/boundary/preview',{method:'POST',body:JSON.stringify(data)}));}catch(e){setMessage(e instanceof Error?e.message:'변환을 완료하지 못했습니다.');}finally{setBusy(false);}}
  return <details><summary>팜맵에서 받은 경계 좌표 가져오기</summary><p>공식 팜맵 API는 인증키 없이 호출하지 않습니다. 내려받은 자료의 좌표계를 확인한 후 꼭짓점을 한 줄에 하나씩 입력하세요. 첫 점을 반복하지 마세요.</p><fieldset disabled={busy} className="farm-fields">
    <label>가져올 필지 이름<input value={name} maxLength={100} onChange={e=>{setName(e.target.value);setPreview(null);}}/></label><label>원본 좌표계<select value={sourceCrs} onChange={e=>{setCrs(e.target.value);setPreview(null);}}><option value="EPSG:5179">EPSG:5179 (Easting Northing, m)</option><option value="EPSG:4326">EPSG:4326 (경도 위도, 도)</option></select></label>
    <label>원본 필지 식별자 (선택)<input maxLength={100} value={sourceId} onChange={e=>{setSourceId(e.target.value);setPreview(null);}}/></label><label className="farm-wide">꼭짓점 좌표<textarea rows={6} maxLength={16000} placeholder="984692.02109, 1830469.43520" value={text} onChange={e=>{setText(e.target.value);setPreview(null);}}/></label><button type="button" onClick={()=>void run(false)}>좌표 변환·면적 미리보기</button>
    {preview&&<><p>{preview.boundary.length}개 꼭짓점 · {preview.areaM2.toFixed(1)}㎡ · {preview.areaMethod}</p><button type="button" onClick={()=>void run(true)}>변환 결과를 필지로 저장</button></>}
    </fieldset>{message&&<p role="status">{message}</p>}</details>;
}
