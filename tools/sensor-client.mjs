// 실제 장치 펌웨어가 사용할 HTTPS JSON 수집 프로토콜의 명령행 참고 클라이언트입니다.
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function sendSensorSample({origin,sensorId,token,sample},fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))){
  const url=new URL(origin);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('HTTPS 또는 로컬 개발 출처만 허용합니다.');
  if(!/^[0-9a-f-]{36}$/i.test(sensorId)||!/^[a-f0-9]{64}$/.test(token))throw new Error('장치 ID와 키 형식을 확인하세요.');
  for(let attempt=0;attempt<3;attempt++){
    try{const response=await fetcher(new URL('/api/v1/sensor-ingest/'+sensorId,url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Device '+token,'Content-Type':'application/json'},body:JSON.stringify(sample)});
      if(response.ok)return {accepted:true};if(response.status<500&&response.status!==429)throw Object.assign(new Error('장치 인증 또는 측정값이 거부됐습니다.'),{permanent:true});
    }catch(e){if(e.permanent||attempt===2)throw new Error('측정값 전송에 실패했습니다. 키·시각·통신 상태를 확인하세요.');}
    if(attempt<2)await wait(500*2**attempt);
  }throw new Error('재시도 한도에 도달했습니다.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const sample={sampleId:process.env.SENSOR_SAMPLE_ID||randomUUID(),value:Number(process.env.SENSOR_VALUE),measuredAt:process.env.SENSOR_MEASURED_AT||new Date().toISOString()};
  if(!Number.isFinite(sample.value)){console.error('SENSOR_VALUE가 필요합니다.');process.exitCode=1;}else sendSensorSample({origin:process.env.SENSOR_API_ORIGIN||'http://localhost:4000',sensorId:process.env.SENSOR_ID||'',token:process.env.SENSOR_DEVICE_TOKEN||'',sample}).then(()=>console.log('측정값이 수락됐습니다. 장치 키와 원본 응답은 출력하지 않았습니다.')).catch(()=>{console.error('전송 실패: 장치 설정과 연결을 확인하세요.');process.exitCode=1;});
}
