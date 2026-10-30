import { Router } from 'express';
import {farmCreateOnce} from './farm-idempotency';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../infrastructure/prisma';
import { requireAuth } from '../../common/auth.middleware';
import { validate, asyncHandler, uuidSchema } from '../../common/validate';
import { success } from '../../common/response';
import { AppError } from '../../common/app-error';
import { listQuery, versionInput } from './farms.dto';
import { recordInput, recordUpdate, recordQuery, recordSchemas, childParams, photoInput, photoParams, sensorInput, productInput, productUpdate, orderInput, orderStatus, readingInput,dateOnly } from './operations.dto';
import { ownedFarm, lockFarm, audit, notFound, conflict, publicSensor, hashToken, acceptReading, buildAdvice, notifyAdvice } from './operations.service';
import { getFarmWeather } from './weather.service';

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

operationsRouter.get('/:id/records', validate('params',uuidSchema),validate('query',recordQuery),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);
  const query = req.validated!.query as z.infer<typeof recordQuery>;
  const where={farmId:req.params.id!,kind:query.kind,deletedAt:null,farm:{ownerId:req.userId!,deletedAt:null}};
  const [items,total]=await prisma.$transaction([prisma.farmRecord.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,skip:(query.page-1)*20}),prisma.farmRecord.count({where})]);
  success(res,{items,total,page:query.page,totalPages:Math.max(1,Math.ceil(total/20))});
}));
operationsRouter.post('/:id/records',validate('params',uuidSchema),validate('body',recordInput),asyncHandler(async(req,res)=>{
  const {kind,data}=req.body as {kind:keyof typeof recordSchemas;data:Prisma.InputJsonObject};
  const record=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    return farmCreateOnce(tx,`record:${req.userId}:${req.params.id}`,req.get('Idempotency-Key'),req.body,async()=>{
    if(kind==='CROP'&&data.plotId&&!await tx.farmRecord.findFirst({where:{id:String(data.plotId),farmId:req.params.id!,kind:'PLOT',deletedAt:null}})) throw notFound();
    const count=await tx.farmRecord.count({where:{farmId:req.params.id!,kind,deletedAt:null}});
    if(count>=1000) throw new AppError(409,'RESOURCE_LIMIT','종류별 활성 자료는 농장당 1,000개까지 등록할 수 있습니다.');
    const item=await tx.farmRecord.create({data:{farmId:req.params.id!,kind,data}});
    await audit(tx,req.userId!,'FARM_RECORD_CREATE',item.id); return item;
    });
  }); success(res,record,'농장 자료를 등록했습니다.',201);
}));
for(const method of ['put','delete'] as const) operationsRouter[method]('/:id/records/:childId',validate('params',childParams),validate('body',method==='put'?recordUpdate:versionInput),asyncHandler(async(req,res)=>{
  const record=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    const where={id:req.params.childId!,farmId:req.params.id!,deletedAt:null};
    const previous=await tx.farmRecord.findFirst({where}); if(!previous) throw notFound();
    let data:Prisma.InputJsonValue|undefined;
    if(method==='put') {
      const parsed=recordSchemas[previous.kind as keyof typeof recordSchemas].safeParse(req.body.data);
      if(!parsed.success) throw new AppError(400,'VALIDATION_ERROR',parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.');
      data=parsed.data;
      if(previous.kind==='CROP'&&'plotId' in parsed.data&&parsed.data.plotId&&!await tx.farmRecord.findFirst({where:{id:parsed.data.plotId,farmId:req.params.id!,kind:'PLOT',deletedAt:null}})) throw notFound();
    }
    if(method==='delete'&&previous.kind==='PLOT'&&await tx.farmRecord.count({where:{farmId:req.params.id!,kind:'CROP',deletedAt:null,data:{path:['plotId'],equals:previous.id}}})) throw new AppError(409,'PLOT_IN_USE','이 필지를 사용하는 작기의 연결을 먼저 변경해 주세요.');
    const changed=await tx.farmRecord.updateMany({where:{...where,version:req.body.version},data:{...(method==='put'?{data}:{deletedAt:new Date()}),version:{increment:1}}});
    if(!changed.count) throw conflict(); await audit(tx,req.userId!,'FARM_RECORD_'+(method==='put'?'UPDATE':'ARCHIVE'),previous.id);
    return tx.farmRecord.findUniqueOrThrow({where:{id:previous.id}});
  }); success(res,record);
}));

operationsRouter.get('/:id/diary/:childId/photos',validate('params',childParams),asyncHandler(async(req,res)=>{
  const entry=await prisma.farmDiary.findFirst({where:{id:req.params.childId!,farmId:req.params.id!,deletedAt:null,farm:{ownerId:req.userId!,deletedAt:null}}});
  if(!entry) throw notFound();
  success(res,await prisma.diaryPhoto.findMany({where:{diaryId:entry.id,file:{ownerId:req.userId!,deletedAt:null}},select:{id:true,fileId:true,caption:true,createdAt:true,file:{select:{originalName:true,mimeType:true}}},take:20}));
}));
operationsRouter.post('/:id/diary/:childId/photos',validate('params',childParams),validate('body',photoInput),asyncHandler(async(req,res)=>{
  const result=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    if(!await tx.farmDiary.findFirst({where:{id:req.params.childId!,farmId:req.params.id!,deletedAt:null}})) throw notFound();
    const files=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "StoredFile" WHERE "id"=${req.body.fileId} AND "ownerId"=${req.userId!} AND "deletedAt" IS NULL AND "mimeType" IN ('image/jpeg','image/png','image/webp') FOR UPDATE`;
    if(!files.length) throw notFound();
    const previous=await tx.diaryPhoto.findUnique({where:{diaryId_fileId:{diaryId:req.params.childId!,fileId:req.body.fileId}}});
    if(previous) return previous;
    if(await tx.diaryPhoto.count({where:{diaryId:req.params.childId!}})>=20) throw new AppError(409,'PHOTO_LIMIT','일지당 사진은 20개까지 연결할 수 있습니다.');
    const photo=await tx.diaryPhoto.create({data:{diaryId:req.params.childId!,...req.body}}); await audit(tx,req.userId!,'DIARY_PHOTO_LINK',photo.id);return photo;
  });success(res,result,'사진을 연결했습니다.',201);
}));
operationsRouter.delete('/:id/diary/:childId/photos/:photoId',validate('params',photoParams),asyncHandler(async(req,res)=>{
  await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    if(!await tx.farmDiary.findFirst({where:{id:req.params.childId!,farmId:req.params.id!,deletedAt:null}})) throw notFound();
    const changed=await tx.diaryPhoto.deleteMany({where:{id:req.params.photoId!,diaryId:req.params.childId!}});
    if(!changed.count) throw notFound(); await audit(tx,req.userId!,'DIARY_PHOTO_UNLINK',req.params.photoId!);
  });success(res,{unlinked:true});
}));

operationsRouter.get('/:id/sensors',validate('params',uuidSchema),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);
  const sensors=await prisma.farmSensor.findMany({where:{farmId:req.params.id!,revokedAt:null},select:{...publicSensor,readings:{take:1,orderBy:{measuredAt:'desc'}}},take:200,orderBy:{createdAt:'desc'}});
  success(res,sensors.map(s=>({...s,status:!s.readings[0]||Date.now()-s.readings[0].measuredAt.getTime()>s.staleMinutes*60000?'OFFLINE':s.readings[0].value<s.minValue||s.readings[0].value>s.maxValue?'ALERT':'NORMAL'})));
}));
operationsRouter.post('/:id/sensors',validate('params',uuidSchema),validate('body',sensorInput),asyncHandler(async(req,res)=>{
  const token=randomBytes(32).toString('hex');
  const sensor=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    if(await tx.farmSensor.count({where:{farmId:req.params.id!,revokedAt:null}})>=200) throw new AppError(409,'SENSOR_LIMIT','농장당 센서는 200개까지 등록할 수 있습니다.');
    const item=await tx.farmSensor.create({data:{...req.body,farmId:req.params.id!,tokenHash:hashToken(token)},select:publicSensor});await audit(tx,req.userId!,'SENSOR_CREATE',item.id);return item;
  });success(res,{...sensor,deviceToken:sensor.simulated?null:token},'장치 키는 지금 한 번만 표시됩니다.',201);
}));
operationsRouter.delete('/:id/sensors/:childId',validate('params',childParams),asyncHandler(async(req,res)=>{
  await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    const changed=await tx.farmSensor.updateMany({where:{id:req.params.childId!,farmId:req.params.id!,revokedAt:null},data:{revokedAt:new Date()}});
    if(!changed.count) throw notFound(); await audit(tx,req.userId!,'SENSOR_REVOKE',req.params.childId!);
  });success(res,{revoked:true});
}));
operationsRouter.get('/:id/sensors/:childId/readings',validate('params',childParams),asyncHandler(async(req,res)=>{
  if(!await prisma.farmSensor.findFirst({where:{id:req.params.childId!,farmId:req.params.id!,farm:{ownerId:req.userId!,deletedAt:null}}})) throw notFound();
  success(res,await prisma.sensorReading.findMany({where:{sensorId:req.params.childId!},take:200,orderBy:{measuredAt:'desc'}}));
}));
operationsRouter.post('/:id/sensors/:childId/simulate',validate('params',childParams),validate('body',readingInput),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);
  if(!await prisma.farmSensor.findFirst({where:{id:req.params.childId!,farmId:req.params.id!}})) throw notFound();
  success(res,await acceptReading(req.params.childId!,req.body,{ownerId:req.userId!,simulator:true}),'시험 데이터를 저장했습니다.',201);
}));
// 센서 장치는 사용자 JWT와 별개의 폐기 가능한 장치 키만 사용합니다.
export const sensorIngestRouter=Router();
sensorIngestRouter.post('/:id',validate('params',uuidSchema),validate('body',readingInput),asyncHandler(async(req,res)=>{
  const header=req.headers.authorization;
  if(!header||!/^Device [a-f0-9]{64}$/.test(header)) throw new AppError(401,'INVALID_DEVICE_KEY','장치 인증이 필요합니다.');
  success(res,await acceptReading(req.params.id!,req.body,{tokenHash:hashToken(header.slice(7))}),'측정값을 저장했습니다.',201);
}));

operationsRouter.get('/:id/weather',validate('params',uuidSchema),asyncHandler(async(req,res)=>{
  const farm=await ownedFarm(req.userId!,req.params.id!);success(res,await getFarmWeather(farm.latitude,farm.longitude));
}));
operationsRouter.get('/:id/advice',validate('params',uuidSchema),asyncHandler(async(req,res)=>success(res,await buildAdvice(req.userId!,req.params.id!))));
operationsRouter.post('/:id/check',validate('params',uuidSchema),asyncHandler(async(req,res)=>success(res,await notifyAdvice(req.userId!,req.params.id!))));
operationsRouter.post('/:id/advice/task',validate('params',uuidSchema),validate('body',z.object({key:z.string().min(1).max(200),requestKey:z.string().uuid(),dueDate:dateOnly,confirmed:z.literal(true)}).strict()),asyncHandler(async(req,res)=>{
  const result=await buildAdvice(req.userId!,req.params.id!);const item=result.advice.find(a=>a.key===req.body.key);if(!item)throw new AppError(404,'ADVICE_NO_LONGER_AVAILABLE','현재 기록에서 해당 추천을 다시 확인할 수 없습니다. 농장 점검을 갱신해 주세요.');
  const saved=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);const scope=`advice-task:${req.userId!}:${req.params.id!}`,key=req.body.requestKey,requestHash=hashToken(JSON.stringify(req.body));
    const old=await tx.idempotentRequest.findUnique({where:{scope_key:{scope,key}}});if(old){if(old.requestHash!==requestHash)throw new AppError(409,'ADVICE_REQUEST_CONFLICT','같은 요청 식별자의 내용이 다릅니다.');return old.response;}
    if(await tx.farmRecord.count({where:{farmId:req.params.id!,kind:'TASK',deletedAt:null}})>=1000)throw new AppError(409,'RESOURCE_LIMIT','활성 작업 일정 등록 한도에 도달했습니다.');
    const record=await tx.farmRecord.create({data:{farmId:req.params.id!,kind:'TASK',data:{title:item.title.slice(0,120),dueDate:req.body.dueDate,status:'TODO',memo:(item.reason+'\n근거: '+item.source).slice(0,2000)},provenance:{type:'CONFIRMED_ADVICE',key:item.key,generatedAt:result.generatedAt}}});
    const response={recordId:record.id,executed:false,requiresFieldWork:true};await tx.idempotentRequest.create({data:{scope,key,requestHash,response}});await audit(tx,req.userId!,'ADVICE_TASK_CONFIRMED',record.id);return response;
  });success(res,saved,'일정만 추가했습니다. 농작업이나 장치 제어를 실행하지 않았습니다.',201);
}));
operationsRouter.post('/:id/sensors/:childId/rotate-key',validate('params',childParams),asyncHandler(async(req,res)=>{
  const token=randomBytes(32).toString('hex');
  const result=await prisma.$transaction(async tx=>{await lockFarm(tx,req.userId!,req.params.id!);const sensor=await tx.farmSensor.findFirst({where:{id:req.params.childId!,farmId:req.params.id!,revokedAt:null,simulated:false}});if(!sensor)throw notFound();await tx.farmSensor.update({where:{id:sensor.id},data:{tokenHash:hashToken(token)}});await audit(tx,req.userId!,'SENSOR_KEY_ROTATE',sensor.id);return{id:sensor.id,deviceToken:token};});success(res,result,'이전 키는 즉시 폐기됩니다. 새 키는 이번 응답에서만 표시합니다.');
}));
operationsRouter.post('/:id/sensors/:childId/commands',validate('params',childParams),asyncHandler(async(req)=>{
  await ownedFarm(req.userId!,req.params.id!);if(!await prisma.farmSensor.findFirst({where:{id:req.params.childId!,farmId:req.params.id!}}))throw notFound();throw new AppError(501,'REMOTE_CONTROL_DISABLED','물리 장치 제어는 안전장치·현장 검증·명시적 승인 체계 구현 전까지 비활성입니다.');
}));
operationsRouter.post('/:id/consult',validate('params',uuidSchema),asyncHandler(async(req)=>{
  await ownedFarm(req.userId!,req.params.id!); throw new AppError(503,'AI_NOT_CONFIGURED','출처 기반 상담 AI가 아직 연결되지 않았습니다. 현재는 일정·센서 기반 확인 안내만 제공합니다.');
}));

operationsRouter.get('/:id/products',validate('params',uuidSchema),validate('query',listQuery),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!); const {page}=req.validated!.query as {page:number};
  const where={farmId:req.params.id!,archivedAt:null};
  const [items,total]=await prisma.$transaction([prisma.farmProduct.findMany({where,take:20,skip:(page-1)*20,orderBy:{createdAt:'desc'}}),prisma.farmProduct.count({where})]);
  success(res,{items,total,totalPages:Math.max(1,Math.ceil(total/20)),page});
}));
operationsRouter.post('/:id/products',validate('params',uuidSchema),validate('body',productInput),asyncHandler(async(req,res)=>{
  const product=await prisma.$transaction(async tx=>{await lockFarm(tx,req.userId!,req.params.id!);return farmCreateOnce(tx,`product:${req.userId!}:${req.params.id!}`,req.get('Idempotency-Key'),req.body,async()=>{const item=await tx.farmProduct.create({data:{farmId:req.params.id!,...req.body}});await audit(tx,req.userId!,'PRODUCT_CREATE',item.id);return item;});});
  success(res,product,'상품을 등록했습니다.',201);
}));
operationsRouter.put('/:id/products/:childId',validate('params',childParams),validate('body',productUpdate),asyncHandler(async(req,res)=>{
  const {version,...data}=req.body;
  const product=await prisma.$transaction(async tx=>{await lockFarm(tx,req.userId!,req.params.id!);
    const where={id:req.params.childId!,farmId:req.params.id!,archivedAt:null};if(!await tx.farmProduct.findFirst({where}))throw notFound();
    if(!(await tx.farmProduct.updateMany({where:{...where,version},data:{...data,version:{increment:1}}})).count)throw conflict();
    await audit(tx,req.userId!,'PRODUCT_UPDATE',req.params.childId!);return tx.farmProduct.findUniqueOrThrow({where:{id:req.params.childId!}});
  });success(res,product);
}));
operationsRouter.get('/:id/orders',validate('params',uuidSchema),validate('query',listQuery),asyncHandler(async(req,res)=>{
  await ownedFarm(req.userId!,req.params.id!);const {page}=req.validated!.query as {page:number};const where={product:{farmId:req.params.id!}};
  const [items,total]=await prisma.$transaction([prisma.farmOrder.findMany({where,take:20,skip:(page-1)*20,orderBy:{createdAt:'desc'},include:{product:{select:{name:true,unit:true}}}}),prisma.farmOrder.count({where})]);
  success(res,{items,total,totalPages:Math.max(1,Math.ceil(total/20)),page});
}));
operationsRouter.post('/:id/products/:childId/orders',validate('params',childParams),validate('body',orderInput),asyncHandler(async(req,res)=>{
  const order=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    const product=await tx.farmProduct.findFirst({where:{id:req.params.childId!,farmId:req.params.id!,archivedAt:null}});if(!product)throw notFound();
    const old=await tx.farmOrder.findUnique({where:{productId_requestKey:{productId:product.id,requestKey:req.body.requestKey}}});
    if(old){if(old.quantity!==req.body.quantity||old.buyerLabel!==req.body.buyerLabel)throw new AppError(409,'ORDER_KEY_CONFLICT','같은 요청 키의 주문 내용이 다릅니다.');return old;}
    const totalWon=product.priceWon*req.body.quantity;
    if(totalWon>2147483647)throw new AppError(400,'ORDER_AMOUNT_LIMIT','주문 금액이 지원 범위를 넘습니다. 주문을 나누어 주세요.');
    if(!(await tx.farmProduct.updateMany({where:{id:product.id,stock:{gte:req.body.quantity}},data:{stock:{decrement:req.body.quantity},version:{increment:1}}})).count)throw new AppError(409,'OUT_OF_STOCK','주문 수량보다 재고가 부족합니다.');
    const item=await tx.farmOrder.create({data:{...req.body,productId:product.id,totalWon}});await audit(tx,req.userId!,'ORDER_RESERVE',item.id);return item;
  });success(res,order,'수기 주문을 등록했습니다. 결제가 처리된 것은 아닙니다.',201);
}));
operationsRouter.patch('/:id/orders/:childId',validate('params',childParams),validate('body',orderStatus),asyncHandler(async(req,res)=>{
  const order=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    const item=await tx.farmOrder.findFirst({where:{id:req.params.childId!,product:{farmId:req.params.id!}}});if(!item)throw notFound();
    if(item.status===req.body.status)return item;
    if(item.status!=='RESERVED')throw new AppError(409,'ORDER_STATE_CONFLICT','이미 처리한 주문입니다.');
    const payment=await tx.farmPayment.findUnique({where:{orderId:item.id}});
    if(payment&&!(req.body.status==='COMPLETED'&&payment.status==='PAID')&&!['FAILED','REFUNDED'].includes(payment.status))throw new AppError(409,'PAYMENT_REQUIRES_RECONCILIATION','연결된 테스트 결제의 상태 확인 또는 환불을 먼저 처리해 주세요.');
    if(req.body.status==='CANCELLED')await tx.farmProduct.update({where:{id:item.productId},data:{stock:{increment:item.quantity},version:{increment:1}}});
    await audit(tx,req.userId!,'ORDER_'+req.body.status,item.id);return tx.farmOrder.update({where:{id:item.id},data:{status:req.body.status}});
  });success(res,order);
}));
