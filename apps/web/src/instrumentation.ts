// 파일 접근은 독립 Node 관측 모듈에서 처리하여 번들에 프로젝트 전체가 포함되지 않게 합니다.
function emit(kind:string){
 if(process.env.NEXT_RUNTIME==='nodejs') (process as unknown as {emit:(event:string,kind:string)=>boolean}).emit('starter-telemetry',kind);
}
export function register(){emit('start');}
export function onRequestError(){emit('failure');}
