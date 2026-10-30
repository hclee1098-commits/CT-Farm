import {Router} from 'express';
import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import {prisma} from '../../infrastructure/prisma';
import {requireAuth} from '../../common/auth.middleware';
import {validate,asyncHandler,uuidSchema} from '../../common/validate';
import {success} from '../../common/response';
import {AppError} from '../../common/app-error';
import {listQuery} from './farms.dto';
import {ownedFarm,lockFarm,hashToken,audit,buildAdvice} from './operations.service';
import {searchKnowledge,safetyReviewRequired} from './knowledge';
import {requestAgricultureAnswer} from './ai.provider';
import {recordSchemas} from './operations.dto';

export const consultationInput=z.object({requestKey:z.string().uuid(),question:z.string().trim().min(2).max(2000),mode:z.enum(['REFERENCE','MODEL']).default('REFERENCE'),allowExternal:z.boolean().default(false)}).strict();
export const consultationsRouter=Router();consultationsRouter.use(requireAuth);
consultationsRouter.get('/:id/knowledge',validate('params',uuidSchema),validate('query',z.object({q:z.string().trim().max(500).default('')}).strict()),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);success(res,{sources:searchKnowledge((req.validated!.query as {q:string}).q),scope:'공식 포털 탐색 색인입니다. 상세 재배 논문·개별 약제 등록 자료를 수집한 RAG가 아닙니다.'});
}));
consultationsRouter.get('/:id/consultations',validate('params',uuidSchema),validate('query',listQuery),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);const {page}=req.validated!.query as {page:number};const where={farmId:req.params.id!,farm:{ownerId:req.userId!,deletedAt:null}};
  const [items,total]=await prisma.$transaction([prisma.farmConsultation.findMany({where,take:20,skip:(page-1)*20,orderBy:[{createdAt:'desc'},{id:'desc'}]}),prisma.farmConsultation.count({where})]);
  success(res,{items,total,page,totalPages:Math.max(1,Math.ceil(total/20)),modelConfigured:process.env.AI_MODE==='OPENAI'&&!!process.env.AI_API_KEY&&!!process.env.AI_MODEL});
}));
consultationsRouter.post('/:id/consultations',validate('params',uuidSchema),validate('body',consultationInput),asyncHandler(async(req,res)=>{
  const ownerId=req.userId!,farmId=req.params.id!,input=req.body as z.infer<typeof consultationInput>;
  const farm=await ownedFarm(ownerId,farmId),sources=searchKnowledge(input.question),needsReview=safetyReviewRequired(input.question);
  const hash=hashToken(JSON.stringify(input)),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
  // 외부 전송은 매 요청마다 사용자 선택을 요구합니다. 주소·좌표·이름·장치 키는 컨텍스트에서 제외합니다.
  if(input.mode==='MODEL'&&!needsReview){
    if(!input.allowExternal)throw new AppError(400,'AI_CONSENT_REQUIRED','질문과 요약된 농장 자료를 외부 AI에 보내는 데 동의해 주세요.');
    if(process.env.AI_MODE!=='OPENAI'||!process.env.AI_API_KEY||!process.env.AI_MODEL)throw new AppError(503,'AI_NOT_CONFIGURED','AI 설정이 없습니다. 자료 안내 모드를 사용할 수 있습니다.');
  }
  const [records,entries,advice,history]=await Promise.all([
    prisma.farmRecord.findMany({where:{farmId,deletedAt:null,kind:{in:['CROP','TASK']}},orderBy:{updatedAt:'desc'},take:20,select:{kind:true,data:true}}),
    prisma.farmDiary.findMany({where:{farmId,deletedAt:null},orderBy:{workDate:'desc'},take:5,select:{workDate:true,title:true,content:true}}),
    buildAdvice(ownerId,farmId),
    prisma.farmConsultation.findMany({where:{farmId,mode:'MODEL',status:'ANSWERED'},orderBy:{createdAt:'desc'},take:3,select:{question:true,answer:true}})
  ]);
  const summarizedRecords=records.map(record=>{
    if(record.kind==='CROP'){const parsed=recordSchemas.CROP.safeParse(record.data);return parsed.success?{kind:record.kind,name:parsed.data.name,variety:parsed.data.variety,stage:parsed.data.stage,plantingDate:parsed.data.plantingDate,harvestDate:parsed.data.harvestDate}:{kind:record.kind,unavailable:true};}
    const parsed=recordSchemas.TASK.safeParse(record.data);return parsed.success?{kind:record.kind,title:parsed.data.title,dueDate:parsed.data.dueDate,status:parsed.data.status,memo:parsed.data.memo.slice(0,160)}:{kind:record.kind,unavailable:true};
  });
  const context={crop:farm.crop,variety:farm.variety,stage:farm.stage,records:summarizedRecords,diary:entries.map(e=>({...e,content:e.content.slice(0,300)})),advice:advice.advice.slice(0,5),dataGaps:advice.dataGaps,recentModelMessages:[...history].reverse().map(h=>({question:h.question.slice(0,400),answer:h.answer?.slice(0,600)})),limits:{records:20,diary:5,recentModelMessages:3,fullHistoryIncluded:false}};
  const external={question:input.question,context,sources};
  const reserved=input.mode==='MODEL'&&!needsReview?Buffer.byteLength(JSON.stringify(external),'utf8')+6000:0;
  const prepared=await prisma.$transaction(async tx=>{
    await lockFarm(tx,ownerId,farmId);
    const previous=await tx.farmConsultation.findUnique({where:{farmId_requestKey:{farmId,requestKey:input.requestKey}}});
    if(previous){if(previous.requestHash!==hash)throw new AppError(409,'CONSULT_KEY_CONFLICT','같은 요청 식별자의 내용이 다릅니다.');return {record:previous,created:false};}
    // 사용자 행 잠금으로 복수 농장을 이용한 일일 비용 제한 우회를 막습니다.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${ownerId} FOR UPDATE`;
    const quota=await tx.aiQuota.upsert({where:{ownerId_day:{ownerId,day}},create:{ownerId,day},update:{}});
    const limit=Number(process.env.AI_DAILY_TOKEN_LIMIT??30000);
    if(quota.requests>=50||quota.reservedTokens+reserved>limit)throw new AppError(429,'AI_BUDGET_EXCEEDED','오늘의 상담 요청 또는 토큰 예산 한도에 도달했습니다.');
    await tx.aiQuota.update({where:{id:quota.id},data:{requests:{increment:1},reservedTokens:{increment:reserved}}});
    const answer=needsReview?'농약·비료 등 안전 관련 판단은 전문가 확인이 필요합니다. 제품·작물 등록, 라벨의 안전사용기준과 토양검정 결과를 확인하세요. 구체적인 사용량·희석·혼용 처방은 제공하지 않습니다.':input.mode==='REFERENCE'?`현재 작물: ${farm.crop}. 저장된 작기·일정과 일지를 먼저 확인하세요.\n${advice.advice.slice(0,3).map(a=>a.title+': '+a.reason).join('\n')}\n아래 공식 자료는 탐색 경로입니다. 지역·품종·생육 단계에 맞는 상세 자료를 추가 확인해야 합니다. 생성형 AI 답변이 아닙니다.`:null;
    const record=await tx.farmConsultation.create({data:{farmId,requestKey:input.requestKey,requestHash:hash,question:input.question,answer,mode:input.mode,status:needsReview?'NEEDS_REVIEW':input.mode==='REFERENCE'?'REFERENCE':'PENDING',sources:sources as unknown as Prisma.InputJsonValue,reservedTokens:reserved,quotaDay:day}});
    await audit(tx,ownerId,'FARM_CONSULTATION_CREATE',record.id);return {record,created:true};
  });
  if(!prepared.created||prepared.record.status!=='PENDING'){success(res,prepared.record,'상담 기록을 확인하세요.',prepared.created?201:200);return;}
  try{
    const result=await requestAgricultureAnswer(external,sources.map(s=>s.id));
    // 출력도 다시 검사합니다. 고위험 단어가 있으면 미검증 답변을 저장·표시하지 않습니다.
    const blocked=safetyReviewRequired(result.answer);
    const record=await prisma.$transaction(async tx=>{await lockFarm(tx,ownerId,farmId);return tx.farmConsultation.update({where:{id:prepared.record.id},data:{status:blocked||result.needsReview?'NEEDS_REVIEW':'ANSWERED',answer:blocked?'안전 관련 내용이 포함되어 답변 표시를 보류했습니다. 전문가와 공식 등록 자료를 확인해 주세요.':result.answer+'\n불확실성: '+result.uncertainty,usageTokens:result.usageTokens}});});
    success(res,record,'모델 답변은 근거와 불확실성을 함께 확인하세요.',201);
  }catch{
    const record=await prisma.farmConsultation.update({where:{id:prepared.record.id},data:{status:'FAILED',errorCode:'AI_PROVIDER_ERROR',answer:'AI 응답을 확인하지 못했습니다. 자동 재호출하지 않았습니다. 불확실한 비용 발생 가능성을 고려해 예약 예산은 유지합니다.'}});
    success(res,record,'실패한 상담 기록입니다. 성공한 답변으로 처리하지 않았습니다.',201);
  }
}));
