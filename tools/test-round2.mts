import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
type Call=(path:string,method?:string,body?:unknown,token?:string|null)=>Promise<{status:number;body:any}>;
export async function runRound2Tests(call:Call,rootCall:Call,prisma:PrismaClient,farmId:string,otherToken:string,deviceCall:(id:string,token:string,data:unknown)=>Promise<{status:number;body:any}>,pass:(name:string)=>void){
  const prefix='/'+farmId;
  assert.equal((await rootCall('/maps/config','GET',undefined,null)).status,401);
  const imported={name:'변환 필지',sourceId:'official-example-fixture',sourceCrs:'EPSG:5179',coordinates:[[984692.0210907353,1830469.4351968889],[984702.0210907353,1830469.4351968889],[984702.0210907353,1830479.4351968889],[984692.0210907353,1830479.4351968889]]};
  const preview=await rootCall('/maps/boundary/preview','POST',imported);assert.equal(preview.status,200);assert(Math.abs(preview.body.data.areaM2-100)<.01);
  assert.equal((await call(prefix+'/plots/import','POST',imported,otherToken)).status,404);
  const plot=await call(prefix+'/plots/import','POST',imported);assert.equal(plot.status,201);assert.equal(plot.body.data.record.provenance.sourceCrs,'EPSG:5179');pass('네이버 미설정 구성·팜맵 좌표 변환·면적·가져오기 출처·소유권');
  const reference={requestKey:randomUUID(),question:'작물 일지 기록을 어떻게 정리하나요?',mode:'REFERENCE',allowExternal:false};
  const answer=await call(prefix+'/consultations','POST',reference);assert.equal(answer.status,201);assert.equal(answer.body.data.status,'REFERENCE');assert(answer.body.data.answer.includes('생성형 AI 답변이 아닙니다'));
  assert.equal((await call(prefix+'/consultations','POST',reference)).body.data.id,answer.body.data.id);
  assert.equal((await call(prefix+'/consultations','POST',{...reference,question:'다른 질문'})).status,409);
  assert.equal((await call(prefix+'/consultations','GET',undefined,otherToken)).status,404);
  assert.equal((await call(prefix+'/consultations','POST',{...reference,requestKey:randomUUID()},otherToken)).status,404);
  const safe=await call(prefix+'/consultations','POST',{...reference,requestKey:randomUUID(),mode:'MODEL',question:'농약 희석 배수와 비료 양 알려줘'});assert.equal(safe.status,201);assert.equal(safe.body.data.status,'NEEDS_REVIEW');assert.equal(safe.body.data.reservedTokens,0);
  assert.equal((await call(prefix+'/consultations','POST',{...reference,requestKey:randomUUID(),mode:'MODEL'})).status,400);pass('농장 상담 이력·중복 방지·타인 접근 차단·약제 안전 검토·외부 전송 동의');
  const originalFetch=globalThis.fetch;
  const originalEnv={AI_MODE:process.env.AI_MODE,AI_MODEL:process.env.AI_MODEL,AI_API_KEY:process.env.AI_API_KEY,AI_DAILY_TOKEN_LIMIT:process.env.AI_DAILY_TOKEN_LIMIT,PAYMENT_MODE:process.env.PAYMENT_MODE,TOSS_TEST_SECRET_KEY:process.env.TOSS_TEST_SECRET_KEY};
  try{
    process.env.AI_MODE='OPENAI';process.env.AI_MODEL='test-model';process.env.AI_API_KEY='fixture-ai-key-not-real';process.env.AI_DAILY_TOKEN_LIMIT='100000';let aiCalls=0,failAi=false;
    globalThis.fetch=(async(url,options)=>{
      if(String(url)==='https://api.openai.com/v1/responses'){aiCalls++;if(failAi)return Response.json({error:'fixture'}, {status:503});return Response.json({status:'completed',usage:{total_tokens:123},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'최근 일지와 생육 단계 기록을 확인해 주세요.',sourceIds:['nongsaro'],uncertainty:'현장 확인이 필요합니다.',needsReview:false})}]}]});}
      return originalFetch(url,options);
    }) as typeof fetch;
    const model={...reference,requestKey:randomUUID(),mode:'MODEL',allowExternal:true};const generated=await call(prefix+'/consultations','POST',model);assert.equal(generated.status,201);assert.equal(generated.body.data.status,'ANSWERED');assert.equal(generated.body.data.usageTokens,123);
    assert.equal((await call(prefix+'/consultations','POST',model)).body.data.id,generated.body.data.id);assert.equal(aiCalls,1);
    process.env.AI_DAILY_TOKEN_LIMIT='1000';assert.equal((await call(prefix+'/consultations','POST',{...model,requestKey:randomUUID()})).status,429);assert.equal(aiCalls,1);
    process.env.AI_DAILY_TOKEN_LIMIT='100000';failAi=true;const failure=await call(prefix+'/consultations','POST',{...model,requestKey:randomUUID()});assert.equal(failure.status,201);assert.equal(failure.body.data.status,'FAILED');assert(failure.body.data.reservedTokens>0);pass('모의 AI 공급자 스키마·사용량·일일 예산·실패 보존·재전송 중복 과금 방지');
    globalThis.fetch=originalFetch;process.env.AI_MODE='REFERENCE';
    const advice=await call(prefix+'/advice');assert.equal(advice.body.data.remoteControlEnabled,false);const item=advice.body.data.advice[0];assert(item);
    const proposal={key:item.key,requestKey:randomUUID(),dueDate:'2026-10-29',confirmed:true};
    assert.equal((await call(prefix+'/advice/task','POST',{...proposal,confirmed:false})).status,400);
    const approved=await call(prefix+'/advice/task','POST',proposal);assert.equal(approved.status,201);assert.equal(approved.body.data.executed,false);assert.equal((await call(prefix+'/advice/task','POST',proposal)).body.data.recordId,approved.body.data.recordId);pass('비서의 자동 알림/승인 필요 일정 구분·명시적 확인·실행 없는 추천 저장');
    const sensor=await call(prefix+'/sensors','POST',{name:'키 회전 시험',kind:'TEMPERATURE',minValue:5,maxValue:35,staleMinutes:60,simulated:false});const sensorId=sensor.body.data.id;
    assert.equal((await call(prefix+`/sensors/${sensorId}/rotate-key`,'POST',{},otherToken)).status,404);
    const rotated=await call(prefix+`/sensors/${sensorId}/rotate-key`,'POST',{});assert.equal(rotated.status,200);const sample={sampleId:randomUUID(),value:20,measuredAt:new Date().toISOString()};
    assert.equal((await deviceCall(sensorId,sensor.body.data.deviceToken,sample)).status,404);assert.equal((await deviceCall(sensorId,rotated.body.data.deviceToken,sample)).status,201);
    assert.equal((await call(prefix+`/sensors/${sensorId}/commands`,'POST',{command:'ON',confirmed:true})).status,501);pass('실장치 JSON 프로토콜·키 회전·이전 키 차단·원격 제어 비활성');
    process.env.PAYMENT_MODE='DISABLED';const unavailable=await call(prefix+'/orders/'+randomUUID()+'/payment','POST',{requestKey:randomUUID()});assert.equal(unavailable.status,503);
    process.env.PAYMENT_MODE='SIMULATOR';
    const product=await call(prefix+'/products','POST',{name:'결제 시험 상품',unit:'상자',priceWon:10000,stock:5});const productId=product.body.data.id;
    async function order(){return (await call(prefix+`/products/${productId}/orders`,'POST',{requestKey:randomUUID(),buyerLabel:'시험 별칭',quantity:2})).body.data;}
    const order1=await order(),intent={requestKey:randomUUID()};
    assert.equal((await call(prefix+`/orders/${order1.id}/payment`,'POST',{...intent,amountWon:1})).status,400);
    const payment=await call(prefix+`/orders/${order1.id}/payment`,'POST',intent);assert.equal(payment.status,201);const paymentId=payment.body.data.id;assert.equal(payment.body.data.amountWon,20000);
    assert.equal((await call(prefix+`/orders/${order1.id}/payment`,'POST',intent)).body.data.id,paymentId);
    assert.equal((await call(prefix+`/orders/${order1.id}/payment`,'POST',{requestKey:randomUUID()})).status,409);
    assert.equal((await call(prefix+'/payments','GET',undefined,otherToken)).status,404);
    const approve={requestKey:randomUUID(),event:'APPROVE'};assert.equal((await call(prefix+`/payments/${paymentId}/simulate`,'POST',approve,otherToken)).status,404);
    assert.equal((await call(prefix+`/payments/${paymentId}/simulate`,'POST',approve)).body.data.status,'PAID');assert.equal((await call(prefix+`/payments/${paymentId}/simulate`,'POST',approve)).body.data.status,'PAID');
    assert.equal((await call(prefix+`/orders/${order1.id}`,'PATCH',{status:'CANCELLED'})).status,409);
    const refund={requestKey:randomUUID(),event:'REFUND'};assert.equal((await call(prefix+`/payments/${paymentId}/simulate`,'POST',refund)).body.data.status,'REFUNDED');assert.equal((await call(prefix+`/payments/${paymentId}/simulate`,'POST',refund)).body.data.status,'REFUNDED');
    assert.equal((await prisma.farmProduct.findUniqueOrThrow({where:{id:productId}})).stock,5);
    const order2=await order(),pay2=(await call(prefix+`/orders/${order2.id}/payment`,'POST',{requestKey:randomUUID()})).body.data;
    await call(prefix+`/payments/${pay2.id}/simulate`,'POST',{requestKey:randomUUID(),event:'APPROVE'});
    assert.equal((await call(prefix+`/orders/${order2.id}`,'PATCH',{status:'COMPLETED'})).status,200);
    await call(prefix+`/payments/${pay2.id}/simulate`,'POST',{requestKey:randomUUID(),event:'REFUND'});
    assert.equal((await prisma.farmProduct.findUniqueOrThrow({where:{id:productId}})).stock,3);pass('테스트 결제의 서버 금액·단일 의도·이벤트 멱등성·환불 재고 1회 복원·인도 후 환불');
    process.env.PAYMENT_MODE='TOSS_TEST';process.env.TOSS_TEST_SECRET_KEY='test_sk_fixture';
    const order3=await order(),pay3=(await call(prefix+`/orders/${order3.id}/payment`,'POST',{requestKey:randomUUID()})).body.data;let pgCalls=0,failPg=true,pgState='DONE';
    globalThis.fetch=(async(url,options)=>{
      if(String(url).startsWith('https://api.tosspayments.com/')){pgCalls++;if(failPg)throw new Error('fixture network loss');return Response.json({paymentKey:'fixture-provider-key',orderId:pay3.id,totalAmount:20000,status:String(url).endsWith('/cancel')?'CANCELED':pgState});}return originalFetch(url,options);
    }) as typeof fetch;
    assert.equal((await call(prefix+`/payments/${pay3.id}/confirm`,'POST',{requestKey:randomUUID(),providerKey:'fixture-provider-key'})).status,502);
    assert.equal((await prisma.farmPayment.findUniqueOrThrow({where:{id:pay3.id}})).status,'PROCESSING');
    assert.equal((await call(prefix+`/payments/${pay3.id}/confirm`,'POST',{requestKey:randomUUID(),providerKey:'fixture-provider-key'})).status,409);assert.equal(pgCalls,1);
    failPg=false;assert.equal((await call(prefix+`/payments/${pay3.id}/reconcile`,'POST',{requestKey:randomUUID()})).body.data.status,'PAID');
    failPg=true;assert.equal((await call(prefix+`/payments/${pay3.id}/refund`,'POST',{requestKey:randomUUID()})).status,502);assert.equal((await prisma.farmPayment.findUniqueOrThrow({where:{id:pay3.id}})).status,'REFUND_PENDING');
    failPg=false;assert.equal((await call(prefix+`/payments/${pay3.id}/reconcile`,'POST',{requestKey:randomUUID()})).status,409);
    pgState='CANCELED';assert.equal((await call(prefix+`/payments/${pay3.id}/reconcile`,'POST',{requestKey:randomUUID()})).body.data.status,'REFUNDED');pass('모의 PG 승인/환불 장애 후 미확정 보존·중복 차단·상태 대조·확인된 전액 취소');
  }finally{globalThis.fetch=originalFetch;for(const [name,value] of Object.entries(originalEnv)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
}
