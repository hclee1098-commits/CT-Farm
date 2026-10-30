"use client";
import { useState } from 'react';
import {NaverMap} from './NaverMap';
import {approximateArea,type Coordinate} from './naver-adapter';
// 배경지도 API가 없을 때도 좌표와 경계를 확인·입력할 수 있는 로컬 도면입니다.
export function LocationMap({latitude,longitude,onPick,boundary=[]}:{latitude:number;longitude:number;onPick?:(lat:number,lon:number)=>void;boundary?:number[][]}){
  const [span,setSpan]=useState(.004);
  const valid=Number.isFinite(latitude)&&Number.isFinite(longitude);
  if(!valid)return <p>유효한 위도·경도를 입력하면 도면을 표시합니다.</p>;
  const project=([lon,lat]:number[])=>`${250+((lon??longitude)-longitude)/span*500},${180-((lat??latitude)-latitude)/span*360}`;
  return <div className="farm-map">
    <NaverMap latitude={latitude} longitude={longitude} boundary={boundary as Coordinate[]} onPick={onPick}/>
    {boundary.length>=3&&<p>경계 근사 면적: {approximateArea(boundary as Coordinate[]).toLocaleString('ko-KR',{maximumFractionDigits:1})}㎡ (구면 근사, 측량용 아님). 등록 면적은 사용자 입력값입니다.</p>}
    <p>좌표 도면 · 중심 {latitude.toFixed(6)}, {longitude.toFixed(6)}. 배경지도·공식 지적도가 연결되지 않은 참고 도면입니다.</p>
    <svg viewBox="0 0 500 360" role="img" aria-label="농장 위치와 필지 경계 좌표 도면" onClick={event=>{
      if(!onPick)return;const box=event.currentTarget.getBoundingClientRect();const lat=latitude+(.5-(event.clientY-box.top)/box.height)*span,lon=longitude+((event.clientX-box.left)/box.width-.5)*span;
      if(Math.abs(lat)<=85&&Math.abs(lon)<=180)onPick(Number(lat.toFixed(6)),Number(lon.toFixed(6)));
    }}>
      <rect width="500" height="360" fill="#eff5ed"/>
      {[0,1,2,3,4,5].map(i=><g key={i} stroke="#cad8cd"><path d={`M ${i*100} 0 V 360`}/><path d={`M 0 ${i*72} H 500`}/></g>)}
      {boundary.length>1&&<polyline points={boundary.map(project).join(' ')} fill={boundary.length>=3?'#1c795033':'none'} stroke="#17613c" strokeWidth="3"/>}
      {boundary.map((point,i)=><circle key={i} cx={project(point).split(',')[0]} cy={project(point).split(',')[1]} r="4" fill="#17613c"/>)}
      <circle cx="250" cy="180" r="7" fill="#ba3c28"/><text x="264" y="176" fill="#253b2c">농장 중심</text>
    </svg>
    <label>도면 범위<select value={span} onChange={e=>setSpan(Number(e.target.value))}><option value={.001}>좁게 (0.001도)</option><option value={.004}>보통 (0.004도)</option><option value={.02}>넓게 (0.02도)</option><option value={.1}>더 넓게 (0.1도)</option></select></label>
    {onPick&&<p>도면을 누르면 좌표를 선택합니다. 키보드로는 위도·경도 입력란을 사용하세요.</p>}
    <a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`} target="_blank" rel="noopener noreferrer">OpenStreetMap에서 위치 확인 (외부 지도)</a>
  </div>;
}
