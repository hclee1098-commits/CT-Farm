import fs from 'node:fs';
// DB 서버 내부 경로는 해당 서버의 수집기에 별도로 지정해야 합니다.
export function probeDisks(targets,minimum=256*1024*1024,stat=fs.statfsSync){
 return ['database','uploads','backup'].map(kind=>{const target=targets?.[kind];if(!target)return {service:'disk-'+kind,status:'unknown',availableBytes:null,configured:false};try{const value=stat(target),bytes=Number(value.bavail)*Number(value.bsize);return {service:'disk-'+kind,status:Number.isFinite(bytes)?bytes<minimum?'down':'up':'unknown',availableBytes:Number.isFinite(bytes)?bytes:null,configured:true};}catch{return {service:'disk-'+kind,status:'unknown',availableBytes:null,configured:true};}});
}
