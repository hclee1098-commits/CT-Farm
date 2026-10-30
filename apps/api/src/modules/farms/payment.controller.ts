import {Router} from 'express';
import {z} from 'zod';
import type {Prisma,FarmPayment} from '@prisma/client';
import {prisma} from '../../infrastructure/prisma';
import {requireAuth} from '../../common/auth.middleware';
import {validate,asyncHandler,uuidSchema} from '../../common/validate';
import {success} from '../../common/response';
import {AppError} from '../../common/app-error';
import {childParams} from './operations.dto';
import {ownedFarm,lockFarm,audit,notFound,hashToken} from './operations.service';
import {assertPaymentEnabled,paymentMode,tossTestRequest} from './payment.provider';
const keyInput=z.object({requestKey:z.string().uuid()}).strict();
const confirmInput=keyInput.extend({providerKey:z.string().min(1).max(200)});
const simulateInput=keyInput.extend({event:z.enum(['APPROVE','DECLINE','REFUND'])});
const publicPayment=(p:FarmPayment)=>({id:p.id,orderId:p.orderId,amountWon:p.amountWon,provider:p.provider,status:p.status,version:p.version,createdAt:p.createdAt,updatedAt:p.updatedAt,testOnly:true});
async function lockPayment(tx:Prisma.TransactionClient,ownerId:string,farmId:string,paymentId:string){
  await lockFarm(tx,ownerId,farmId);const p=await tx.farmPayment.findFirst({where:{id:paymentId,order:{product:{farmId}}}});if(!p)throw notFound();return p;
}
async function finalize(tx:Prisma.TransactionClient,payment:FarmPayment,status:'PAID'|'FAILED'|'REFUNDED',ownerId:string,requestKey:string,verifiedPreApprovalCancel=false){
  const old=await tx.paymentEvent.findUnique({where:{paymentId_requestKey:{paymentId:payment.id,requestKey}}});
  if(old){if(old.action!==status)throw new AppError(409,'PAYMENT_EVENT_CONFLICT','같은 결제 요청 식별자의 동작이 다릅니다.');return payment;}
  if(payment.status===status)return payment;
  if(status==='REFUNDED'){
    if(!['PAID','REFUND_PENDING'].includes(payment.status)&&!(verifiedPreApprovalCancel&&payment.status==='PROCESSING'))throw new AppError(409,'PAYMENT_STATE_CONFLICT','승인 또는 공급자의 전액 취소가 확인된 결제만 환불 처리할 수 있습니다.');
    const order=await tx.farmOrder.findUniqueOrThrow({where:{id:payment.orderId}});
    // 인도 완료 이후의 환불은 실물 반품과 다르므로 재고를 자동 복원하지 않습니다.
    if(order.status==='RESERVED'){await tx.farmOrder.update({where:{id:order.id},data:{status:'CANCELLED'}});await tx.farmProduct.update({where:{id:order.productId},data:{stock:{increment:order.quantity},version:{increment:1}}});}
  }else if(!['PENDING','PROCESSING'].includes(payment.status))throw new AppError(409,'PAYMENT_STATE_CONFLICT','이미 처리한 결제입니다.');
  await tx.paymentEvent.create({data:{paymentId:payment.id,requestKey,action:status}});await audit(tx,ownerId,'TEST_PAYMENT_'+status,payment.id);
  return tx.farmPayment.update({where:{id:payment.id},data:{status,version:{increment:1}}});
}
export const paymentsRouter=Router();paymentsRouter.use(requireAuth);
paymentsRouter.get('/:id/payment-config',validate('params',uuidSchema),asyncHandler(async(req,res)=>{await ownedFarm(req.userId!,req.params.id!);success(res,{mode:paymentMode(),testOnly:true,liveSupported:false});}));
paymentsRouter.get('/:id/payments',validate('params',uuidSchema),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);const rows=await prisma.farmPayment.findMany({where:{order:{product:{farmId:req.params.id!}}},orderBy:{createdAt:'desc'},take:100});success(res,rows.map(publicPayment));
}));
paymentsRouter.post('/:id/orders/:childId/payment',validate('params',childParams),validate('body',keyInput),asyncHandler(async(req,res)=>{
  const mode=assertPaymentEnabled();
  const payment=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    const order=await tx.farmOrder.findFirst({where:{id:req.params.childId!,product:{farmId:req.params.id!}}});if(!order)throw notFound();
    const old=await tx.farmPayment.findUnique({where:{orderId:order.id}});if(old){if(old.requestKey!==req.body.requestKey)throw new AppError(409,'PAYMENT_ALREADY_EXISTS','주문에 이미 결제 의도가 있습니다. 새 결제를 만들지 말고 기존 상태를 확인하세요.');return old;}
    if(order.status!=='RESERVED')throw new AppError(409,'ORDER_STATE_CONFLICT','예약 상태의 주문만 테스트 결제를 시작할 수 있습니다.');
    const item=await tx.farmPayment.create({data:{orderId:order.id,requestKey:req.body.requestKey,amountWon:order.totalWon,provider:mode}});await audit(tx,req.userId!,'TEST_PAYMENT_CREATE',item.id);return item;
  });success(res,publicPayment(payment),'테스트 결제 의도입니다. 실결제나 결제 승인이 아닙니다.',201);
}));
paymentsRouter.post('/:id/payments/:childId/simulate',validate('params',childParams),validate('body',simulateInput),asyncHandler(async(req,res)=>{
  if(assertPaymentEnabled()!=='SIMULATOR')throw new AppError(409,'PAYMENT_MODE_MISMATCH','로컬 시뮬레이터 모드에서만 사용할 수 있습니다.');
  const result=await prisma.$transaction(async tx=>{const payment=await lockPayment(tx,req.userId!,req.params.id!,req.params.childId!);if(payment.provider!=='SIMULATOR')throw new AppError(409,'PAYMENT_MODE_MISMATCH','실제 PG 시험 결제를 시뮬레이터로 바꿀 수 없습니다.');return finalize(tx,payment,req.body.event==='APPROVE'?'PAID':req.body.event==='DECLINE'?'FAILED':'REFUNDED',req.userId!,req.body.requestKey);});success(res,publicPayment(result),'시뮬레이터 상태 변경입니다. 외부 결제를 수행하지 않았습니다.');
}));
for(const action of ['confirm','refund','reconcile'] as const)paymentsRouter.post(`/:id/payments/:childId/${action}`,validate('params',childParams),validate('body',action==='confirm'?confirmInput:keyInput),asyncHandler(async(req,res)=>{
  if(assertPaymentEnabled()!=='TOSS_TEST')throw new AppError(409,'PAYMENT_MODE_MISMATCH','토스 테스트 전용 설정이 필요합니다.');
  // 네트워크 요청 전 잘못된 키/라이브 키를 차단합니다.
  if(!/^test_(?:sk|gsk)_/.test(process.env.TOSS_TEST_SECRET_KEY??''))throw new AppError(503,'PAYMENT_TEST_KEY_REQUIRED','라이브 키는 허용하지 않습니다. 테스트 서버 키가 필요합니다.');
  const prepared=await prisma.$transaction(async tx=>{
    const payment=await lockPayment(tx,req.userId!,req.params.id!,req.params.childId!);
    if(payment.provider!=='TOSS_TEST')throw new AppError(409,'PAYMENT_MODE_MISMATCH','다른 공급자의 결제입니다.');
    if(action==='confirm'&&payment.status==='PAID'||action==='refund'&&payment.status==='REFUNDED')return {payment,already:true};
    if(action==='confirm'&&payment.status!=='PENDING'||action==='refund'&&payment.status!=='PAID')throw new AppError(409,'PAYMENT_RECONCILE_REQUIRED','결제 상태를 먼저 조회하세요. 승인·환불을 중복 실행하지 않습니다.');
    if(action==='reconcile'&&!['PROCESSING','REFUND_PENDING'].includes(payment.status))throw new AppError(409,'PAYMENT_STATE_CONFLICT','미확정 결제에만 상태 확인을 요청할 수 있습니다.');
    const providerKey=action==='confirm'?req.body.providerKey:payment.providerKey;if(!providerKey)throw new AppError(409,'PAYMENT_KEY_MISSING','결제 인증 키가 없습니다.');
    const updated=action==='reconcile'?payment:await tx.farmPayment.update({where:{id:payment.id},data:{providerKey,status:action==='confirm'?'PROCESSING':'REFUND_PENDING',eventHash:hashToken(req.body.requestKey),version:{increment:1}}});
    return {payment:updated,already:false};
  });
  if(prepared.already){success(res,publicPayment(prepared.payment));return;}
  const p=prepared.payment;
  const result=await tossTestRequest(action==='confirm'?'CONFIRM':action==='refund'?'REFUND':'QUERY',{paymentId:p.id,providerKey:p.providerKey!,amountWon:p.amountWon,requestKey:p.id+(action==='refund'?'-refund':'-confirm')});
  if(!['DONE','CANCELED'].includes(result.status))throw new AppError(409,'PAYMENT_STILL_PENDING','결제사업자의 최종 상태가 아직 확정되지 않았습니다.');
  if(action==='reconcile'&&p.status==='REFUND_PENDING'&&result.status==='DONE')throw new AppError(409,'REFUND_NOT_CONFIRMED','공급자에서 환불 완료가 확인되지 않았습니다. 미확정 상태를 유지합니다. 반복 환불 대신 PG 기록을 확인해 주세요.');
  const final=await prisma.$transaction(async tx=>{const current=await lockPayment(tx,req.userId!,req.params.id!,p.id);return finalize(tx,current,result.status==='DONE'?'PAID':'REFUNDED',req.userId!,req.body.requestKey,action==='reconcile'&&result.status==='CANCELED');});
  success(res,publicPayment(final),'토스 테스트 환경에서 확인한 상태입니다. 실결제가 아닙니다.');
}));
