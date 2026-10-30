// textContent로만 표시하며 접근키를 영구 저장하지 않습니다.
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function select(label,values){const wrap=element('label',label+' '),input=element('select');for(const [value,text]of values){const o=element('option',text);o.value=value;input.append(o);}wrap.append(input);return [wrap,input];}
export function showMonitor(container,token,mode){
 const controller=new AbortController(),signal=controller.signal;let retry,timer,latest=[],paused=false,lastMessage=0;
 const controls=element('div');controls.className='monitor-controls';
 const [ew,env]=select('환경',[['LOCAL','LOCAL'],['STAGING','STAGING'],['PRODUCTION','PRODUCTION'],['ALL','전체 환경']]);
 const [sw,service]=select('서비스',[['','전체'],...['api','web','database','redis','mail','backup','deployment','collector','security'].map(v=>[v,v])]);
 const [lw,level]=select('수준',[['','전체'],['info','정보'],['warn','경고'],['error','오류']]);
 const [tw,time]=select('범위',[['60','최근 1시간'],['15','최근 15분'],['1440','최근 24시간']]);
 const search=element('input');search.placeholder='로그 검색 (상태·요청 ID·버전)';search.setAttribute('aria-label','로그 검색');
 const pause=element('button','자동 갱신 일시정지'),status=element('p','연결 중…'),summary=element('div'),logs=element('pre'),history=element('div');
 summary.className='monitor-grid';logs.className='monitor-log';logs.setAttribute('aria-label','수집된 실시간 로그');
 controls.append(ew,sw,lw,tw,search,pause);container.append(controls,status,summary,history,element('h2','실시간 이벤트'),logs);
 const incidentBox=element('section');incidentBox.setAttribute('aria-label','장애 사건과 복구 이력');container.append(incidentBox);
 async function incidentPoll(){if(signal.aborted||paused)return;incidentBox.replaceChildren(element('h2','장애 · 복구 · 확인 상태'),element('p','현재 포털 서버의 로컬 사건 이력입니다. 원격 사건 동기화와 외부 실제 발송은 지원하지 않습니다.'));if(env.value==='ALL'){incidentBox.append(element('p','사건 이력은 환경을 하나 선택하여 확인하세요.'));return;}try{const response=await fetch('/incidents?environment='+env.value,{headers:{Authorization:'Bearer '+token},signal});if(!response.ok)throw Error();const items=await response.json();if(signal.aborted)return;if(!items.length)incidentBox.append(element('p','저장된 장애 사건이 없습니다.'));for(const i of items){incidentBox.append(element('p',`${i.service} · ${i.resolvedAt?'복구됨':'장애 중'} · ${i.acknowledgedAt?'확인함':'확인 필요'} · 외부 발송 ${i.delivery==='TEST_ONLY'?'시험 기록만':'미설정'}`),element('p',`발생 ${i.openedAt} / 복구 ${i.resolvedAt||'미복구'}`),element('pre',`$env:APP_ENV='${env.value}'\nnode tools/monitoring/incidents.mjs ack ${i.id}`));}incidentBox.append(element('p','이 화면은 조회 전용입니다. 확인 처리는 해당 환경의 로컬 운영자 CLI에서 수행합니다.'));}catch(e){if(e.name!=='AbortError')incidentBox.append(element('p','사건 이력 조회 실패 · 기존 관측은 유지됩니다.'));}}
 const incidentTimer=setInterval(()=>void incidentPoll(),15000);env.addEventListener('change',()=>void incidentPoll());void incidentPoll();
 const names={api:'API',web:'WEB',database:'PostgreSQL',redis:'Redis',mail:'이메일 (최근 발송)',backup:'백업 (최근 실행)',disk:'관측 저장소 디스크 여유 공간'};
 const state={up:'정상',down:'장애',unknown:'미확인',not_configured:'미설정'};
 const value=v=>v===null||v===undefined?'수집되지 않음':String(v);
 function draw(){if(signal.aborted)return;summary.replaceChildren();history.replaceChildren();for(const data of latest){
  const card=element('section');card.className='card';card.append(element('h2',data.environment));
  card.append(element('p','수집기: '+(data.connection==='unreachable'?'원격 연결 실패':data.connection==='not_configured'?'원격 설정 필요':data.collector.status==='connected'?'연결됨':data.collector.status==='stale'?'수집 중단 감지':'수집되지 않음')));
  for(const [key,label]of Object.entries(names)){const item=data.services[key];card.append(element('p',`${label}: ${state[item.status]||'미확인'}${item.stale?' · 관측 만료':''}`));}
  card.append(element('p',`API 요청 ${value(data.requests)} · HTTP 오류 ${value(data.errors)} · 오류율 ${data.errorRate===null?'계산할 요청 없음':(data.errorRate*100).toFixed(1)+'%'} · 평균 ${data.meanLatency===null?'미측정':data.meanLatency.toFixed(1)+'ms'}`));
  card.append(element('p','마지막 수집: '+value(data.lastCollectedAt)),element('p','최근 배포: '+(data.deployment?data.deployment.version+' / '+data.deployment.time:'기록 없음')),element('p','최근 장애: '+(data.incidents.at(-1)?.time||'범위 내 기록 없음')));summary.append(card);
  const section=element('details');section.append(element('summary',data.environment+' 배포·롤백 이력 ('+data.deployments.length+')'));for(const e of data.deployments)section.append(element('p',`${e.time} · ${e.kind} · ${e.version||'버전 미기록'} · ${e.result||''} · 승인 ${e.approved===true?'있음':e.approved===false?'없음':'미기록'} · 검증 ${value(e.verified)}`));history.append(section);
 }
 const events=latest.flatMap(d=>d.events).sort((a,b)=>a.time.localeCompare(b.time)).filter(e=>(!service.value||e.service===service.value)&&(!level.value||e.level===level.value)&&JSON.stringify(e).toLowerCase().includes(search.value.toLowerCase()));const text=events.slice(-500).map(e=>JSON.stringify(e)).join('\n')||'선택한 조건의 실제 이벤트가 없습니다.';if(logs.textContent!==text){logs.textContent=text;logs.scrollTop=logs.scrollHeight;}
 }
 async function poll(){if(signal.aborted||paused)return;try{const response=await fetch(`/monitor?environment=${env.value}&minutes=${time.value}`,{headers:{Authorization:'Bearer '+token},signal});if(!response.ok)throw Error();latest=(await response.json()).snapshots;lastMessage=Date.now();status.textContent='연결됨 · 자동 갱신 · '+new Date().toLocaleTimeString();draw();}catch(e){if(e.name!=='AbortError')status.textContent='조회 실패 · 접근키 만료/네트워크 확인';}}
 // 필터 변경 시 이전 SSE 연결을 닫고 다시 연결합니다.
 let sseController;
 async function stream(){sseController?.abort();const local=new AbortController();sseController=local;signal.addEventListener('abort',()=>local.abort(),{once:true});try{const response=await fetch(`/monitor-stream?environment=${env.value}&minutes=${time.value}`,{headers:{Authorization:'Bearer '+token},signal:local.signal});if(!response.ok)throw Error();const reader=response.body.getReader(),decoder=new TextDecoder();let buf='';while(true){const {done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});const frames=buf.split('\n\n');buf=frames.pop();for(const f of frames)if(f.startsWith('data: ')&&!paused){const d=JSON.parse(f.slice(6));if(d.environment!==env.value||d.minutes!==Number(time.value))continue;latest=d.snapshots;lastMessage=Date.now();status.textContent='실시간 연결됨 · '+new Date().toLocaleTimeString();draw();}}}catch(e){if(e.name==='AbortError')return;status.textContent='연결 끊김 · 5초 후 재연결';}if(!signal.aborted)retry=setTimeout(stream,5000);}
 for(const node of [env,time])node.onchange=()=>{clearTimeout(retry);latest=[];draw();void poll();void stream();};for(const node of [service,level,search])node.oninput=draw;
 pause.onclick=()=>{paused=!paused;pause.textContent=paused?'자동 갱신 재개':'자동 갱신 일시정지';status.textContent=paused?'일시정지':'재연결 중';if(!paused)void poll();};
 timer=setInterval(()=>{if(!paused&&lastMessage&&Date.now()-lastMessage>20000){status.textContent='수신 중단 감지 · 재연결 중';lastMessage=Date.now();clearTimeout(retry);void stream();}},5000);
 function cleanup(){controller.abort();sseController?.abort();clearTimeout(retry);clearInterval(timer);clearInterval(incidentTimer);}
 void poll();void stream();return {abort:cleanup};
}
