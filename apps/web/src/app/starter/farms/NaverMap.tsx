"use client";
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../_lib/auth';
import {mountNaverMap,type NaverSdk,type Coordinate} from './naver-adapter';
declare global {interface Window {naver?:{maps:NaverSdk}}}
let sdkPromise:Promise<NaverSdk>|null=null;
export function loadNaverSdk(keyId:string):Promise<NaverSdk>{
  if(window.naver?.maps)return Promise.resolve(window.naver.maps);
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId='+encodeURIComponent(keyId);script.async=true;
    const timer=setTimeout(()=>fail(),15000);
    const fail=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(new Error('네이버 지도를 불러오지 못했습니다. 등록 도메인과 키를 확인해 주세요.'));};
    script.onerror=fail;script.onload=()=>{clearTimeout(timer);if(window.naver?.maps)resolve(window.naver.maps);else fail();};document.head.append(script);
  });return sdkPromise;
}
export function NaverMap({latitude,longitude,boundary,onPick}:{latitude:number;longitude:number;boundary:Coordinate[];onPick?:(lat:number,lon:number)=>void}){
  const {request}=useAuth();const element=useRef<HTMLDivElement>(null);const [sdk,setSdk]=useState<NaverSdk|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!sdk||!element.current)return;try{const dispose=mountNaverMap(sdk,element.current,latitude,longitude,boundary,onPick);return()=>{try{dispose();}catch{/* 공급자 해제 오류가 좌표 도면을 중단하지 않습니다. */}};}catch{setError('지도 표시를 완료하지 못했습니다. 좌표 도면으로 위치와 경계를 확인해 주세요.');setSdk(null);}},[sdk,latitude,longitude,boundary,onPick]);
  async function open(){setBusy(true);setError('');try{const config=await request<{naverKeyId:string|null}>('/maps/config');if(!config.naverKeyId)throw new Error('네이버 지도 키가 아직 설정되지 않았습니다. 아래 좌표 도면을 이용하세요.');setSdk(await loadNaverSdk(config.naverKeyId));}catch(e){setError(e instanceof Error?e.message:'지도를 불러오지 못했습니다.');}finally{setBusy(false);}}
  return <section aria-label="네이버 지도"><p>네이버 지도를 켜면 현재 농장 위치가 네이버 지도 서비스에 전달됩니다. 공식 지적 경계가 아닌 등록한 필지를 표시합니다.</p><button type="button" disabled={busy} onClick={()=>void open()}>{busy?'지도 연결 중…':'네이버 지도 불러오기'}</button>{error&&<p role="alert">{error}</p>}<div ref={element} style={{width:'100%',height:sdk?360:0}}/>{sdk&&<p>지도에서 위치와 경계를 확인하세요. 저장은 별도의 저장 버튼을 눌러야 합니다.</p>}</section>;
}
