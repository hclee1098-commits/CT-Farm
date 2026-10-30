export type Coordinate=[number,number];
export interface NaverLayer {setMap(map:unknown):void}
export interface NaverSdk {
  LatLng:new(lat:number,lon:number)=>unknown;
  Map:new(element:HTMLElement,options:{center:unknown;zoom:number})=>unknown;
  Marker:new(options:{position:unknown;map:unknown})=>NaverLayer;
  Polygon:new(options:{map:unknown;paths:unknown[];strokeColor:string;fillColor:string;fillOpacity:number})=>NaverLayer;
  Event:{addListener(map:unknown,type:string,handler:(event:{coord:{lat():number;lng():number}})=>void):unknown;removeListener(listener:unknown):void};
}
export function mountNaverMap(sdk:NaverSdk,element:HTMLElement,latitude:number,longitude:number,boundary:Coordinate[],onPick?:(latitude:number,longitude:number)=>void){
  const map=new sdk.Map(element,{center:new sdk.LatLng(latitude,longitude),zoom:17});
  const marker=new sdk.Marker({map,position:new sdk.LatLng(latitude,longitude)});
  const polygon=boundary.length>=3?new sdk.Polygon({map,paths:boundary.map(([lon,lat])=>new sdk.LatLng(lat,lon)),strokeColor:'#17613c',fillColor:'#17613c',fillOpacity:.2}):null;
  const listener=onPick?sdk.Event.addListener(map,'click',event=>onPick(event.coord.lat(),event.coord.lng())):null;
  return()=>{if(listener)sdk.Event.removeListener(listener);polygon?.setMap(null);marker.setMap(null);element.replaceChildren();};
}
export function approximateArea(points:Coordinate[]){
  if(points.length<3)return 0;
  const radius=6371008.8,reference=points[0][0]*Math.PI/180;
  // 작은 필지에서의 구면 근사 면적입니다. 법적 측량 면적을 대체하지 않습니다.
  const lat0=points.reduce((sum,p)=>sum+p[1],0)/points.length*Math.PI/180;
  const projected=points.map(([lon,lat])=>[(lon*Math.PI/180-reference)*radius*Math.cos(lat0),lat*Math.PI/180*radius]);
  return Math.abs(projected.reduce((sum,p,i)=>{const next=projected[(i+1)%projected.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
}
