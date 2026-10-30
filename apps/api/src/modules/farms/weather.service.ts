import { z } from 'zod';
import { AppError } from '../../common/app-error';

const dailySchema=z.object({
  time:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(7),
  temperature_2m_max:z.array(z.number().finite().nullable()),
  temperature_2m_min:z.array(z.number().finite().nullable()),
  precipitation_sum:z.array(z.number().finite().nullable()),
  wind_speed_10m_max:z.array(z.number().finite().nullable())
}).refine(d=>[d.temperature_2m_max,d.temperature_2m_min,d.precipitation_sum,d.wind_speed_10m_max].every(a=>a.length===d.time.length));
export const weatherSchema=z.object({daily:dailySchema});
type WeatherResult={fetchedAt:string;source:string;officialWarnings:boolean;days:{date:string;maxC:number|null;minC:number|null;rainMm:number|null;windMs:number|null;risks:string[]}[]};
const cache=new Map<string,{expires:number;result:WeatherResult}>();
const pending=new Map<string,Promise<WeatherResult>>();
export async function getFarmWeather(latitude:number,longitude:number,fetcher:typeof fetch=fetch):Promise<WeatherResult> {
  const mode=process.env.WEATHER_MODE??'DISABLED';
  if(!['OPEN_METEO_NON_COMMERCIAL','OPEN_METEO_CUSTOMER'].includes(mode))throw new AppError(503,'WEATHER_NOT_CONFIGURED','날씨 연동 설정이 필요합니다. 현재 예보를 임의로 표시하지 않습니다.');
  const customer=mode==='OPEN_METEO_CUSTOMER';
  if(customer&&!process.env.WEATHER_API_KEY)throw new AppError(503,'WEATHER_NOT_CONFIGURED','날씨 서비스 키가 설정되지 않았습니다.');
  if(!customer&&process.env.APP_ENV&&process.env.APP_ENV!=='LOCAL')throw new AppError(503,'WEATHER_LICENSE_REQUIRED','서버 운영용 날씨 이용 조건과 유료 설정을 확인해 주세요.');
  const key=mode+':'+latitude+':'+longitude;
  const saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.result;
  if(pending.has(key))return pending.get(key)!;
  const task=(async()=>{
    const url=new URL(customer?'https://customer-api.open-meteo.com/v1/forecast':'https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',wind_speed_unit:'ms',timezone:'Asia/Seoul',forecast_days:'3',...(customer?{apikey:process.env.WEATHER_API_KEY!}:{})}).toString();
    try {
      const response=await fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!response.ok)throw new Error('provider');
      // 크기를 제한해 잘못된 외부 응답의 메모리 사용을 제한합니다.
      const reader=response.body?.getReader();if(!reader)throw new Error('body');
      let bytes=0,text='';const decoder=new TextDecoder();
      try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>131072)throw new Error('size');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
      const {daily}=weatherSchema.parse(JSON.parse(text));
      const result:WeatherResult={fetchedAt:new Date().toISOString(),source:'Open-Meteo https://open-meteo.com/ (CC BY 4.0)',officialWarnings:false,days:daily.time.map((date,i)=>{
        const maxC=daily.temperature_2m_max[i]??null,minC=daily.temperature_2m_min[i]??null,rainMm=daily.precipitation_sum[i]??null,windMs=daily.wind_speed_10m_max[i]??null;
        return{date,maxC,minC,rainMm,windMs,risks:[...(minC!==null&&minC<=0?['영하 예보: 현장 온도 확인']:[]),...(maxC!==null&&maxC>=33?['고온 예보: 작업 시간·급수 상태 확인']:[]),...(rainMm!==null&&rainMm>=30?['많은 비 예보: 배수 상태 확인']:[]),...(windMs!==null&&windMs>=10?['강풍 가능성: 시설 고정 상태 확인']:[])]};
      })};
      if(cache.size>=1000)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+600000,result});return result;
    }catch{throw new AppError(502,'WEATHER_UNAVAILABLE','날씨 자료를 가져오지 못했습니다. 기상청 공식 예보를 함께 확인해 주세요.');}
  })();
  pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
