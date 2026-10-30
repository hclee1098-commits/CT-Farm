import {z} from 'zod';
import {AppError} from '../../common/app-error';
export function paymentMode(){const mode=process.env.PAYMENT_MODE??'DISABLED';if(!['DISABLED','SIMULATOR','TOSS_TEST'].includes(mode))throw new AppError(503,'PAYMENT_NOT_CONFIGURED','지원하지 않는 결제 설정입니다.');return mode;}
export function assertPaymentEnabled(){const mode=paymentMode();if(mode==='DISABLED')throw new AppError(503,'PAYMENT_NOT_CONFIGURED','테스트 결제 설정이 필요합니다. 실결제는 지원하지 않습니다.');if(mode==='SIMULATOR'&&process.env.APP_ENV&&process.env.APP_ENV!=='LOCAL')throw new AppError(503,'SIMULATOR_LOCAL_ONLY','결제 시뮬레이터는 로컬 시험 환경에서만 사용할 수 있습니다.');return mode;}
const providerPayment=z.object({paymentKey:z.string().min(1).max(200),orderId:z.string(),totalAmount:z.number().int().positive(),status:z.string()});
export async function tossTestRequest(action:'CONFIRM'|'REFUND'|'QUERY',input:{paymentId:string;providerKey:string;amountWon:number;requestKey:string},fetcher:typeof fetch=fetch){
  const key=process.env.TOSS_TEST_SECRET_KEY;
  if(paymentMode()!=='TOSS_TEST'||!key||!/^test_(?:sk|gsk)_/.test(key))throw new AppError(503,'PAYMENT_TEST_KEY_REQUIRED','토스 테스트 전용 서버 키가 필요합니다. 라이브 키는 허용하지 않습니다.');
  const base='https://api.tosspayments.com/v1/payments';
  const url=action==='CONFIRM'?base+'/confirm':base+'/'+encodeURIComponent(input.providerKey)+(action==='REFUND'?'/cancel':'');
  try{
    const response=await fetcher(url,{method:action==='QUERY'?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json',...(action==='QUERY'?{}:{'Idempotency-Key':input.requestKey})},...(action==='QUERY'?{}:{body:JSON.stringify(action==='CONFIRM'?{paymentKey:input.providerKey,orderId:input.paymentId,amount:input.amountWon}:{cancelReason:'CT-Farm 테스트 주문 전액 취소',cancelAmount:input.amountWon})})});
    if(!response.ok)throw new Error('provider');
    const reader=response.body?.getReader();if(!reader)throw new Error('body');let size=0,text='';const decoder=new TextDecoder();
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144)throw new Error('size');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
    const data=providerPayment.parse(JSON.parse(text));
    if(data.orderId!==input.paymentId||data.totalAmount!==input.amountWon||data.paymentKey!==input.providerKey)throw new Error('mismatch');
    if(action==='CONFIRM'&&data.status!=='DONE')throw new Error('not done');
    if(action==='REFUND'&&data.status!=='CANCELED')throw new Error('not cancelled');
    return data;
  }catch{throw new AppError(502,'PAYMENT_STATUS_UNKNOWN','결제사업자의 최종 상태를 확인하지 못했습니다. 승인·환불을 반복하지 말고 상태 조회로 확인해 주세요.');}
}
