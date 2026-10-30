"use client";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback,useEffect,useState,type FormEvent } from 'react';
import { useAuth } from '../../_lib/auth';
import { getErrorMessage } from '../../_lib/api';
import { LocationMap } from '../LocationMap';
import {BoundaryImport} from '../BoundaryImport';
import {ConsultationChat} from '../ConsultationChat';
import {PaymentsPanel} from '../PaymentsPanel';
import '../farms.css';

type Farm={id:string;name:string;latitude:number;longitude:number;crop:string;stage:string};
type Kind='PLOT'|'CROP'|'TASK'|'LEDGER'|'HARVEST';
type Data=Record<string,string|number|number[][]|null>;
type RecordItem={id:string;version:number;kind:Kind;data:Data;createdAt:string};
type Product={id:string;version:number;name:string;unit:string;priceWon:number;stock:number};
type Order={id:string;buyerLabel:string;quantity:number;totalWon:number;status:string;product:{name:string;unit:string}};
type Reading={id:string;value:number;measuredAt:string};
type Sensor={id:string;name:string;kind:string;minValue:number;maxValue:number;staleMinutes:number;status:string;simulated:boolean;readings:Reading[]};
type Advice={generatedAt:string;limitation:string;dataGaps:string[];advice:{key:string;title:string;reason:string;source:string;severity:string}[];truncated:boolean};
type Weather={source:string;fetchedAt:string;days:{date:string;maxC:number|null;minC:number|null;rainMm:number|null;windMs:number|null;risks:string[]}[]};
type Page<T>={items:T[];totalPages:number;total:number};
type Field={key:string;label:string;type?:string;options?:[string,string][];max?:number};
const stageOptions:[string,string][]=[['PREPARING','재배 준비'],['SOWING','파종·정식'],['GROWING','생육'],['HARVESTING','수확'],['RESTING','휴경']];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const definitions:Record<Kind,{label:string;fields:Field[];initial:Record<string,string>}>= {
  PLOT:{label:'필지',fields:[{key:'name',label:'필지 이름',max:100},{key:'areaM2',label:'면적 (㎡)',type:'number'}],initial:{name:'',areaM2:'100'}},
  CROP:{label:'작물·작기',fields:[{key:'name',label:'작물',max:80},{key:'variety',label:'품종 (선택)',max:80},{key:'stage',label:'생육 단계',options:stageOptions},{key:'plantingDate',label:'파종·정식일',type:'date'},{key:'harvestDate',label:'수확 예정일',type:'date'}],initial:{name:'',variety:'',stage:'PREPARING',plantingDate:today,harvestDate:today,plotId:''}},
  TASK:{label:'작업 일정',fields:[{key:'title',label:'작업 제목',max:120},{key:'dueDate',label:'예정일',type:'date'},{key:'status',label:'처리 상태',options:[['TODO','예정'],['DONE','완료'],['CANCELLED','취소']]},{key:'memo',label:'메모',type:'textarea'}],initial:{title:'',dueDate:today,status:'TODO',memo:''}},
  LEDGER:{label:'수입·비용',fields:[{key:'title',label:'항목',max:120},{key:'date',label:'기록일',type:'date'},{key:'type',label:'구분',options:[['INCOME','수입'],['EXPENSE','비용']]},{key:'amountWon',label:'금액 (원)',type:'number'},{key:'memo',label:'메모',type:'textarea'}],initial:{title:'',date:today,type:'EXPENSE',amountWon:'',memo:''}},
  HARVEST:{label:'수확 기록',fields:[{key:'crop',label:'작물',max:80},{key:'date',label:'수확일',type:'date'},{key:'quantityKg',label:'수확량 (kg)',type:'number'},{key:'memo',label:'메모',type:'textarea'}],initial:{crop:'',date:today,quantityKg:'',memo:''}}
};
const displayValue=(key:string,value:Data[string])=>key==='stage'?stageOptions.find(([v])=>v===value)?.[1]??String(value):key==='status'?({TODO:'예정',DONE:'완료',CANCELLED:'취소'}[String(value)]??String(value)):key==='type'?(value==='INCOME'?'수입':'비용'):typeof value==='number'?value.toLocaleString('ko-KR'):String(value??'');

export default function FarmOperations(){
  const params=useParams<{id:string}>();const id=params.id;
  const {user,loading,request}=useAuth();
  const [farm,setFarm]=useState<Farm|null>(null),[tab,setTab]=useState<Kind|'OVERVIEW'|'SENSORS'|'SALES'>('OVERVIEW');
  const [records,setRecords]=useState<RecordItem[]>([]),[plots,setPlots]=useState<RecordItem[]>([]),[page,setPage]=useState(1),[pages,setPages]=useState(1),[total,setTotal]=useState(0);
  const [form,setForm]=useState<Record<string,string>>({}),[editing,setEditing]=useState<RecordItem|null>(null),[boundary,setBoundary]=useState<number[][]>([]),[point,setPoint]=useState({lat:'',lon:''});
  const [sensors,setSensors]=useState<Sensor[]>([]),[readings,setReadings]=useState<Reading[]>([]),[readingLabel,setReadingLabel]=useState(''),[sensorForm,setSensorForm]=useState({name:'',kind:'MOISTURE',minValue:'20',maxValue:'80',staleMinutes:'60',simulated:true});
  const [products,setProducts]=useState<Product[]>([]),[orders,setOrders]=useState<Order[]>([]),[product,setProduct]=useState({name:'',unit:'상자',priceWon:'',stock:''}),[productEdit,setProductEdit]=useState<Product|null>(null);
  const [buyer,setBuyer]=useState(''),[quantity,setQuantity]=useState('1'),[orderKey,setOrderKey]=useState(''),[orderProduct,setOrderProduct]=useState(''),[orderPage,setOrderPage]=useState(1),[orderPages,setOrderPages]=useState(1);
  const [advice,setAdvice]=useState<Advice|null>(null),[weather,setWeather]=useState<Weather|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[fetching,setFetching]=useState(false),[deviceKey,setDeviceKey]=useState('');
  const [samples,setSamples]=useState<Record<string,string>>({});
  const [adviceConfirmed,setAdviceConfirmed]=useState(false),[adviceDate,setAdviceDate]=useState(today);
  const [adviceKeys,setAdviceKeys]=useState<Record<string,string>>({});
  const isKind=(value:string):value is Kind=>value in definitions;
  const refresh=useCallback(async()=>{
    if(isKind(tab)) {const result=await request<Page<RecordItem>>(`/farms/${id}/records?kind=${tab}&page=${page}`);setRecords(result.items);setPages(result.totalPages);setTotal(result.total);if(tab==='CROP'){const list=await request<Page<RecordItem>>(`/farms/${id}/records?kind=PLOT&page=1`);setPlots(list.items);}}
    else if(tab==='SENSORS')setSensors(await request<Sensor[]>(`/farms/${id}/sensors`));
    else if(tab==='SALES'){const [p,o]=await Promise.all([request<Page<Product>>(`/farms/${id}/products?page=${page}`),request<Page<Order>>(`/farms/${id}/orders?page=${orderPage}`)]);setProducts(p.items);setPages(p.totalPages);setTotal(p.total);setOrders(o.items);setOrderPages(o.totalPages);}
    else setAdvice(await request<Advice>(`/farms/${id}/advice`));
  },[id,request,tab,page,orderPage]);
  useEffect(()=>{
    if(!user){setFarm(null);return;}let active=true;
    request<Farm>(`/farms/${id}`).then(f=>{if(active)setFarm(f);}).catch(e=>{if(active)setError(getErrorMessage(e));});
    return()=>{active=false;};
  },[id,user,request]);
  useEffect(()=>{
    if(!user)return;setFetching(true);setError('');
    // 불러오는 동안 메뉴 이동을 막아 이전 요청이 새 탭의 자료를 덮어쓰지 않게 합니다.
    refresh().catch(e=>setError(getErrorMessage(e))).finally(()=>setFetching(false));
  },[user,refresh]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(getErrorMessage(e));}finally{setBusy(false);}}
  function changeTab(value:typeof tab){setTab(value);setPage(1);setOrderPage(1);setEditing(null);setDeviceKey('');setReadings([]);setRecords([]);setMessage('');if(isKind(value)){setForm(Object.fromEntries(Object.entries(definitions[value].initial).map(([key,v])=>[key,key==='date'||key.endsWith('Date')?today:v])));setBoundary([]);}}
  function addPoint(){const lat=Number(point.lat),lon=Number(point.lon);if(!point.lat||!point.lon||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180){setError('유효한 위도·경도를 입력해 주세요.');return;}setBoundary([...boundary,[lon,lat]]);}
  function saveRecord(e:FormEvent){e.preventDefault();if(!isKind(tab))return;void run(async()=>{
    const data:Data={...form};for(const key of ['areaM2','amountWon','quantityKg'])if(key in data)data[key]=Number(data[key]);
    if(tab==='PLOT')data.boundary=boundary;if(tab==='CROP')data.plotId=form.plotId||null;
    await request(`/farms/${id}/records${editing?'/'+editing.id:''}`,{method:editing?'PUT':'POST',body:JSON.stringify(editing?{version:editing.version,data}:{kind:tab,data})});setEditing(null);setForm(definitions[tab].initial);setBoundary([]);await refresh();setMessage('자료를 저장했습니다.');
  });}
  if(loading)return <p role="status">로그인 확인 중…</p>;
  if(!user)return <p><Link href="/starter/login">로그인 후 농장 관리</Link></p>;
  return <div className="starter-container farm-workspace"><Link href="/starter/farms">← 농장 목록·영농일지</Link><h1>{farm?.name??'농장'} 관리</h1>
    <nav aria-label="농장 관리 메뉴" className="farm-tabs">{([['OVERVIEW','농장 점검'],...Object.entries(definitions).map(([k,d])=>[k,d.label]),['SENSORS','센서'],['SALES','상품·주문']] as [typeof tab,string][]).map(([value,label])=><button key={value} disabled={busy||fetching} aria-current={tab===value?'page':undefined} onClick={()=>changeTab(value)}>{label}</button>)}</nav>
    {error&&<p role="alert" className="starter-alert error">{error}</p>}{message&&<p role="status">{message}</p>}{fetching&&<p role="status">자료를 불러오는 중…</p>}
    {farm&&tab==='OVERVIEW'&&<><section className="starter-card"><h2>농장 위치</h2><LocationMap latitude={farm.latitude} longitude={farm.longitude}/></section>
      <section className="starter-card"><h2>농장 점검·작업 안내</h2><p>AI 상담은 미연동입니다. 아래 안내는 저장된 일정과 센서 설정에 따른 규칙 기반 점검입니다.</p>
        <button disabled={busy||fetching} onClick={()=>void run(async()=>{const result=await request<Advice&{created:number}>(`/farms/${id}/check`,{method:'POST',body:'{}'});setAdvice(result);setMessage(`새 알림 ${result.created}건을 저장했습니다. 상단 알림 메뉴에서 처리할 수 있습니다.`);})}>점검하고 알림 저장</button>
        {advice&&<><p>{advice.limitation}</p>{advice.dataGaps?.map(gap=><p key={gap}>{gap}</p>)}<label>추천을 추가할 작업일<input type="date" value={adviceDate} onChange={e=>setAdviceDate(e.target.value)}/></label><label><input type="checkbox" checked={adviceConfirmed} onChange={e=>setAdviceConfirmed(e.target.checked)}/> 추천 이유를 확인했습니다. 일정만 추가하며 작업·장치 제어는 실행하지 않습니다.</label>{advice.advice.length===0&&<p>현재 기록 기준으로 확인이 필요한 항목이 없습니다. 미수집 자료의 안전을 보장하지 않습니다.</p>}{advice.advice.map(a=><article key={a.key} className="farm-item"><h3>{a.title}</h3><p>{a.reason}</p><small>근거: {a.source}</small><button disabled={busy||!adviceConfirmed||!adviceDate} onClick={()=>void run(async()=>{const identity=a.key+':'+adviceDate;const requestKey=adviceKeys[identity]??crypto.randomUUID();setAdviceKeys({...adviceKeys,[identity]:requestKey});await request(`/farms/${id}/advice/task`,{method:'POST',body:JSON.stringify({key:a.key,requestKey,dueDate:adviceDate,confirmed:true})});setMessage('확인한 추천을 작업 일정에 추가했습니다. 장치나 농작업을 실행하지 않았습니다.');})}>확인한 추천을 일정으로 추가</button></article>)}{advice.truncated&&<p>자료가 많아 일부 기록만 점검했습니다.</p>}</>}
      </section><section className="starter-card"><h2>농장 날씨</h2><button disabled={busy} onClick={()=>void run(async()=>setWeather(await request<Weather>(`/farms/${id}/weather`)))}>예보 불러오기</button><p>외부 연동이 설정된 경우 농장 좌표의 3일 예보를 불러옵니다. 공식 기상특보는 별도로 확인하세요.</p>
        {weather&&<><p>{weather.source} · 조회 {new Date(weather.fetchedAt).toLocaleString('ko-KR')}</p>{weather.days.map(d=><article key={d.date} className="farm-item"><h3>{d.date}</h3><p>최저 {d.minC??'미확인'}°C / 최고 {d.maxC??'미확인'}°C · 강수 {d.rainMm??'미확인'}mm · 풍속 {d.windMs??'미확인'}m/s</p>{d.risks.map(r=><p key={r}>{r}</p>)}</article>)}</>}
      </section><ConsultationChat farmId={id}/></>}
    {isKind(tab)&&<><section className="starter-card"><h2>{definitions[tab].label} {editing?'수정':'등록'}</h2><form onSubmit={saveRecord}><fieldset disabled={busy||fetching} className="farm-fields">
      {definitions[tab].fields.map(field=><label key={field.key}>{field.label}{field.options?<select value={form[field.key]??''} onChange={e=>setForm({...form,[field.key]:e.target.value})}>{field.options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:field.type==='textarea'?<textarea rows={3} maxLength={2000} value={form[field.key]??''} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>:<input required={field.key!=='variety'} type={field.type??'text'} maxLength={field.max} step={field.type==='number'?'any':undefined} min={field.type==='number'?0:undefined} value={form[field.key]??''} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>}</label>)}
      {tab==='CROP'&&<label>연결 필지<select value={form.plotId??''} onChange={e=>setForm({...form,plotId:e.target.value})}><option value="">필지 연결 없음</option>{plots.map(p=><option key={p.id} value={p.id}>{String(p.data.name)}</option>)}</select><small>최근 20개 필지 중 선택합니다.</small></label>}
      {tab==='PLOT'&&farm&&<div className="farm-wide"><h3>필지 경계</h3><p>최소 3개 꼭짓점을 순서대로 입력합니다. 처음 점을 반복하지 마세요. 공식 지적 경계가 아닙니다.</p>
        <LocationMap latitude={farm.latitude} longitude={farm.longitude} boundary={boundary} onPick={(lat,lon)=>setBoundary([...boundary,[lon,lat]])}/>
        <div className="farm-fields"><label>꼭짓점 위도<input type="number" step="any" value={point.lat} onChange={e=>setPoint({...point,lat:e.target.value})}/></label><label>꼭짓점 경도<input type="number" step="any" value={point.lon} onChange={e=>setPoint({...point,lon:e.target.value})}/></label></div>
        <button type="button" onClick={addPoint}>꼭짓점 추가</button><button type="button" onClick={()=>setBoundary(boundary.slice(0,-1))}>마지막 점 지우기</button><p>{boundary.length}개 꼭짓점</p><ol>{boundary.map(([lon,lat],i)=><li key={i}>{lat}, {lon}</li>)}</ol></div>}
      <button type="submit" className="starter-button">저장</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(definitions[tab].initial);setBoundary([]);}}>수정 취소</button>}
    </fieldset></form>{tab==='PLOT'&&<BoundaryImport farmId={id} onSaved={refresh}/>}</section>
    <section className="starter-card"><h2>{definitions[tab].label} 목록 · {total}건</h2>
      {tab==='LEDGER'&&<p>현재 페이지 합계: 수입 {records.filter(r=>r.data.type==='INCOME').reduce((s,r)=>s+Number(r.data.amountWon),0).toLocaleString('ko-KR')}원 / 비용 {records.filter(r=>r.data.type==='EXPENSE').reduce((s,r)=>s+Number(r.data.amountWon),0).toLocaleString('ko-KR')}원. 주문과 자동 합산하지 않습니다.</p>}
      {!fetching&&!records.length&&<p>등록한 자료가 없습니다.</p>}{records.map(item=><article key={item.id} className="farm-item"><h3>{String(item.data.name??item.data.title??item.data.crop)}</h3><dl>{definitions[item.kind].fields.filter(f=>!['name','title','crop'].includes(f.key)).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{displayValue(f.key,item.data[f.key]??'')}</dd></div>)}</dl>
      {item.kind==='PLOT'&&farm&&<LocationMap latitude={farm.latitude} longitude={farm.longitude} boundary={item.data.boundary as number[][]}/>}
      <button disabled={busy||fetching} onClick={()=>{setEditing(item);setForm(Object.fromEntries(Object.entries(item.data).filter(([key])=>key!=='boundary').map(([key,value])=>[key,String(value??'')])));if(item.kind==='PLOT')setBoundary(item.data.boundary as number[][]);window.scrollTo({top:0,behavior:'smooth'});}}>수정</button>
      <button disabled={busy||fetching} onClick={()=>{if(!window.confirm('이 자료를 보관할까요? 원본은 보존됩니다.'))return;void run(async()=>{await request(`/farms/${id}/records/${item.id}`,{method:'DELETE',body:JSON.stringify({version:item.version})});await refresh();setMessage('자료를 보관했습니다.');});}}>보관</button></article>)}
      <Pager page={page} pages={pages} disabled={busy||fetching} change={setPage}/>
    </section></>}
    {tab==='SENSORS'&&<><section className="starter-card"><h2>센서 등록</h2><p>수분·습도는 %, 온도는 °C입니다. 적정 범위는 농장 조건에 맞게 직접 설정하세요.</p>
      <form onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await request<Sensor&{deviceToken:string|null}>(`/farms/${id}/sensors`,{method:'POST',body:JSON.stringify({...sensorForm,minValue:Number(sensorForm.minValue),maxValue:Number(sensorForm.maxValue),staleMinutes:Number(sensorForm.staleMinutes)})});setDeviceKey(result.deviceToken?`장치 ID: ${result.id}\n장치 키: ${result.deviceToken}`:'');await refresh();setMessage('센서를 등록했습니다.');});}}><fieldset disabled={busy||fetching} className="farm-fields">
      <label>센서 이름<input required maxLength={100} value={sensorForm.name} onChange={e=>setSensorForm({...sensorForm,name:e.target.value})}/></label>
      <label>종류<select value={sensorForm.kind} onChange={e=>setSensorForm({...sensorForm,kind:e.target.value})}><option value="MOISTURE">토양 수분 (%)</option><option value="TEMPERATURE">온도 (°C)</option><option value="HUMIDITY">습도 (%)</option></select></label>
      {([['minValue','최소 기준'],['maxValue','최대 기준'],['staleMinutes','통신 지연 기준 (분)']] as const).map(([key,label])=><label key={key}>{label}<input required type="number" step="any" value={sensorForm[key]} onChange={e=>setSensorForm({...sensorForm,[key]:e.target.value})}/></label>)}
      <label>데이터 종류<select value={String(sensorForm.simulated)} onChange={e=>setSensorForm({...sensorForm,simulated:e.target.value==='true'})}><option value="true">시험용 시뮬레이터</option><option value="false">실제 센서 장치</option></select></label><button type="submit">센서 등록</button>
      </fieldset></form>{deviceKey&&<div role="status"><p>이 장치 키는 한 번만 표시합니다. 안전한 장치 설정에 보관한 후 숨겨 주세요.</p><pre className="farm-content">{deviceKey}</pre><button onClick={()=>setDeviceKey('')}>키 숨기기</button></div>}
    </section><section className="starter-card"><h2>센서 상태</h2>{sensors.length===0&&<p>등록한 센서가 없습니다.</p>}{sensors.map(s=><article key={s.id} className="farm-item"><h3>{s.name} {s.simulated?'(시험 데이터)':''}</h3><p>{({OFFLINE:'통신·측정 지연',ALERT:'설정 범위 이탈',NORMAL:'설정 범위 내'} as Record<string,string>)[s.status]} · 최근 값 {s.readings[0]?.value??'미수집'} · 기준 {s.minValue}~{s.maxValue}</p>
      {s.simulated&&<div><label>{s.name} 시험 측정값<input type="number" step="any" value={samples[s.id]??'30'} onChange={e=>setSamples({...samples,[s.id]:e.target.value})}/></label><button disabled={busy} onClick={()=>{const value=samples[s.id]??'30';if(value.trim()===''){setError('시험 측정값을 입력해 주세요.');return;}void run(async()=>{await request(`/farms/${id}/sensors/${s.id}/simulate`,{method:'POST',body:JSON.stringify({sampleId:crypto.randomUUID(),value:Number(value),measuredAt:new Date().toISOString()})});await refresh();setMessage('시험 측정값을 저장했습니다.');});}}>시험 값 전송</button></div>}
      <button disabled={busy} onClick={()=>void run(async()=>{setReadings(await request<Reading[]>(`/farms/${id}/sensors/${s.id}/readings`));setReadingLabel(s.name+(s.simulated?' (시험 데이터)':''));})}>측정 이력·차트</button>
      {!s.simulated&&<button disabled={busy} onClick={()=>void run(async()=>{const result=await request<{id:string;deviceToken:string}>(`/farms/${id}/sensors/${s.id}/rotate-key`,{method:'POST',body:'{}'});setDeviceKey(`장치 ID: ${result.id}\n새 장치 키: ${result.deviceToken}`);setMessage('이전 장치 키를 폐기했습니다. 새 키를 안전하게 보관하세요.');})}>장치 키 재발급 (이전 키 폐기)</button>}
      <button disabled={busy} onClick={()=>{if(!window.confirm('센서를 중지하고 장치 키를 폐기할까요? 측정 이력은 남습니다.'))return;void run(async()=>{await request(`/farms/${id}/sensors/${s.id}`,{method:'DELETE'});await refresh();});}}>센서 중지</button>
    </article>)}{readingLabel&&<><h3>{readingLabel} · 최근 200건</h3><ReadingChart readings={readings}/><div className="farm-scroll"><table><thead><tr><th>측정 시각</th><th>값</th></tr></thead><tbody>{readings.map(r=><tr key={r.id}><td>{new Date(r.measuredAt).toLocaleString('ko-KR')}</td><td>{r.value}</td></tr>)}</tbody></table></div></>}
    </section></>}
    {tab==='SALES'&&<><section className="starter-card"><h2>상품·재고 {productEdit?'수정':'등록'}</h2><p>농장주 수기 주문 관리입니다. 온라인 결제·스마트스토어·구매자용 판매 페이지는 연결되지 않았습니다.</p>
      <form onSubmit={e=>{e.preventDefault();void run(async()=>{await request(`/farms/${id}/products${productEdit?'/'+productEdit.id:''}`,{method:productEdit?'PUT':'POST',body:JSON.stringify({...product,priceWon:Number(product.priceWon),stock:Number(product.stock),...(productEdit?{version:productEdit.version}:{})})});setProductEdit(null);setProduct({name:'',unit:'상자',priceWon:'',stock:''});await refresh();setMessage('상품을 저장했습니다.');});}}><fieldset disabled={busy} className="farm-fields">
      {([['name','상품명','text'],['unit','판매 단위 (예: 5kg 상자)','text'],['priceWon','단가 (원)','number'],['stock','판매 가능 재고 (판매 단위 수)','number']] as const).map(([key,label,type])=><label key={key}>{label}<input required type={type} step={type==='number'?1:undefined} min={type==='number'?0:undefined} maxLength={key==='unit'?40:120} value={product[key]} onChange={e=>setProduct({...product,[key]:e.target.value})}/></label>)}<button type="submit">상품 저장</button>{productEdit&&<button type="button" onClick={()=>{setProductEdit(null);setProduct({name:'',unit:'상자',priceWon:'',stock:''});}}>수정 취소</button>}
      </fieldset></form>
    </section><section className="starter-card"><h2>상품 목록 · {total}건</h2>{products.map(p=><article className="farm-item" key={p.id}><h3>{p.name}</h3><p>{p.priceWon.toLocaleString('ko-KR')}원 / {p.unit} · 재고 {p.stock}</p><button disabled={busy} onClick={()=>{setProductEdit(p);setProduct({name:p.name,unit:p.unit,priceWon:String(p.priceWon),stock:String(p.stock)});}}>상품·재고 수정</button><button disabled={busy} onClick={()=>{setOrderProduct(p.id);setOrderKey(crypto.randomUUID());setMessage(`${p.name} 주문 수량을 아래에 입력해 주세요.`);}}>이 상품 수기 주문</button></article>)}<Pager page={page} pages={pages} disabled={busy||fetching} change={setPage}/>
      {orderProduct&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{await request(`/farms/${id}/products/${orderProduct}/orders`,{method:'POST',body:JSON.stringify({requestKey:orderKey,buyerLabel:buyer,quantity:Number(quantity)})});setOrderProduct('');setBuyer('');await refresh();setMessage('주문 예약과 재고 차감을 저장했습니다. 결제는 처리하지 않았습니다.');});}}><fieldset disabled={busy} className="farm-fields"><label>거래 상대 별칭 (연락처 입력 금지)<input required maxLength={80} value={buyer} onChange={e=>setBuyer(e.target.value)}/></label><label>판매 단위 수량<input required type="number" min={1} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button type="submit">주문 예약</button><button type="button" onClick={()=>setOrderProduct('')}>입력 취소</button></fieldset></form>}
    </section><section className="starter-card"><h2>수기 주문</h2>{orders.map(o=><article key={o.id} className="farm-item"><h3>{o.product.name} · {o.buyerLabel}</h3><p>{o.quantity} {o.product.unit} · {o.totalWon.toLocaleString('ko-KR')}원 · {({RESERVED:'예약',COMPLETED:'인도 완료',CANCELLED:'취소'} as Record<string,string>)[o.status]}</p>{o.status==='RESERVED'&&(['COMPLETED','CANCELLED'] as const).map(status=><button key={status} disabled={busy} onClick={()=>{if(!window.confirm(status==='CANCELLED'?'주문을 취소하고 재고를 복원할까요?':'상품 인도를 완료 처리할까요? 결제 여부는 별도로 확인하세요.'))return;void run(async()=>{await request(`/farms/${id}/orders/${o.id}`,{method:'PATCH',body:JSON.stringify({status})});await refresh();});}}>{status==='COMPLETED'?'인도 완료':'주문 취소'}</button>)}</article>)}<Pager page={orderPage} pages={orderPages} disabled={busy||fetching} change={setOrderPage}/></section></>}
    {tab==='SALES'&&<PaymentsPanel farmId={id} orders={orders} onChanged={refresh}/>}
  </div>;
}
function Pager({page,pages,change,disabled}:{page:number;pages:number;change:(p:number)=>void;disabled:boolean}){return <div className="starter-actions"><button disabled={disabled||page<=1} onClick={()=>change(page-1)}>이전</button><span>{page} / {pages}</span><button disabled={disabled||page>=pages} onClick={()=>change(page+1)}>다음</button></div>;}
function ReadingChart({readings}:{readings:Reading[]}){
  if(!readings.length)return <p>측정값이 없습니다.</p>;const sorted=[...readings].sort((a,b)=>Date.parse(a.measuredAt)-Date.parse(b.measuredAt)),values=sorted.map(r=>r.value),min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1),start=Date.parse(sorted[0].measuredAt),span=Math.max(1,Date.parse(sorted[sorted.length-1].measuredAt)-start);
  return <figure><svg viewBox="0 0 500 180" role="img" aria-label={`측정값 시계열. 최저 ${min}, 최고 ${max}. 아래 표에 전체 값 제공.`}><path d="M 45 15 V 150 H 490" stroke="#63756a" fill="none"/><polyline points={sorted.map(r=>`${45+(Date.parse(r.measuredAt)-start)/span*440},${145-(r.value-min)/range*120}`).join(' ')} stroke="#17613c" fill="none" strokeWidth="3"/><text x="0" y="25">{max}</text><text x="0" y="145">{min}</text></svg><figcaption>측정 시각 기준 시계열 · 아래 표에서 정확한 값을 확인하세요.</figcaption></figure>;
}
