import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {prisma} from '../../infrastructure/prisma';
import {redis,connectRedis} from '../../infrastructure/redis';
import {requireAuth} from '../../common/auth.middleware';
import {validate,asyncHandler,uuidSchema} from '../../common/validate';
import {AppError} from '../../common/app-error';
import {success} from '../../common/response';
import {lockFarm,audit} from './operations.service';
import {farmCreateOnce} from './farm-idempotency';
import {voiceTurn,voicePayload,koreanDate,type VoiceDraft,type VoiceTask} from './voice-dialogue';
import {authorize,createDiary} from './collaboration.core';
import {sqlClient,reportAssignedTask} from './collaboration.controller';
export const voiceRouter=Router();voiceRouter.use(requireAuth);
type Session={id:string;version:number;today:string;draft:VoiceDraft;lastRequestId?:string;tasks?:VoiceTask[];farms?:{id:string;name:string;crop:string}[];canAttachDiaryPhoto?:boolean};
const key=(user:string,id:string)=>`voice:v1:${user}:${id}`;
async function accessibleVoiceFarms(userId:string){const enabled=process.env.FARM_COLLABORATION_ENABLED==='true';return prisma.farm.findMany({where:{deletedAt:null,owner:{deletedAt:null,suspendedAt:null},OR:[{ownerId:userId},...(enabled?[{members:{some:{userId,revokedAt:null,role:{in:['ADMIN','WORKER']}}}}]:[])]},select:{id:true,name:true,crop:true,ownerId:true},take:500});}
async function voiceAccess(tx:Parameters<typeof sqlClient>[0],farmId:string,userId:string,capability:string){try{return await authorize(sqlClient(tx),farmId,userId,capability);}catch(e){if(e instanceof Error&&e.message==='FARM_NOT_FOUND')throw new AppError(404,'VOICE_FARM_ACCESS','농장과 작업 권한을 다시 확인해 주세요.');throw e;}}
async function restrictSession(session:Session,userId:string,farms:{id:string;name:string;crop:string}[]){session.farms=farms.map(f=>({id:f.id,name:f.name,crop:f.crop}));if(session.draft.farmId&&!farms.some(f=>f.id===session.draft.farmId))throw new AppError(404,'VOICE_FARM_ACCESS','현재 대화의 농장에 접근할 수 없습니다.');if(session.tasks?.length){const tasks=await prisma.farmRecord.findMany({where:{id:{in:session.tasks.map(t=>t.id)},farmId:{in:farms.map(f=>f.id)},kind:'TASK',deletedAt:null,data:{path:['assigneeId'],equals:userId}},select:{id:true}});const ids=new Set(tasks.map(t=>t.id));session.tasks=session.tasks.filter(t=>ids.has(t.id));}}
voiceRouter.post('/sessions',validate('body',z.object({}).strict()),asyncHandler(async(req,res)=>{await connectRedis();const quota=`voice:quota:${req.userId}:${Math.floor(Date.now()/1800000)}`;const count=await redis.incr(quota);if(count===1)await redis.expire(quota,1800);if(count>20){res.setHeader('Retry-After','1800');throw new AppError(429,'VOICE_SESSION_LIMIT','대화를 너무 많이 시작했습니다. 기존 대화를 이어 주세요.');}const session:Session={id:randomUUID(),version:0,today:koreanDate(),draft:{phase:'ASK',question:'무슨 작업을 하셨거나 알려 드릴까요?'}};await redis.set(key(req.userId!,session.id),JSON.stringify(session),{EX:1800});session.farms=(await accessibleVoiceFarms(req.userId!)).map(f=>({id:f.id,name:f.name,crop:f.crop}));success(res,session,'대화를 시작합니다.',201);}));
voiceRouter.post('/sessions/:id/turn',validate('params',uuidSchema),validate('body',z.object({version:z.number().int().min(0),requestId:z.string().uuid(),text:z.string().trim().min(1).max(1000),evidenceFileId:z.string().uuid().optional()}).strict()),asyncHandler(async(req,res)=>{
 await connectRedis();const sessionKey=key(req.userId!,req.params.id!),lease=randomUUID(),lock=sessionKey+':lock';
 if(!await redis.set(lock,lease,{NX:true,PX:60000}))throw new AppError(409,'VOICE_BUSY','앞선 말을 처리 중입니다. 잠시 후 다시 눌러 주세요.');
 try{
 const raw=await redis.get(sessionKey);if(!raw)throw new AppError(404,'VOICE_EXPIRED','대화가 만료되었습니다. 새로 시작해 주세요.');const session=JSON.parse(raw) as Session;
 const farms=await accessibleVoiceFarms(req.userId!);await restrictSession(session,req.userId!,farms);
 if(['SAVED','CANCELLED'].includes(session.draft.phase)){success(res,session);return;}
 if(session.lastRequestId===req.body.requestId){success(res,session);return;}
 if(session.version!==req.body.version)throw new AppError(409,'VOICE_VERSION','대화가 변경되었습니다. 새로 불러와 주세요.');
 const collaboration=process.env.FARM_COLLABORATION_ENABLED==='true';
 const records=collaboration?await prisma.farmRecord.findMany({where:{kind:'TASK',deletedAt:null,farmId:{in:farms.map(f=>f.id)},data:{path:['assigneeId'],equals:req.userId!}},select:{id:true,farmId:true,data:true,version:true},take:100}):[];
 const tasks=records.filter(r=>['TODO','REWORK'].includes(String((r.data as Record<string,unknown>).status))).map(r=>({id:r.id,farmId:r.farmId,title:String((r.data as Record<string,unknown>).title),version:r.version}));session.tasks=tasks;
 // 자정을 넘긴 대화에서도 '오늘'은 현재 발화 시점의 서울 날짜입니다.
 session.today=koreanDate();session.draft=voiceTurn(session.draft,req.body.text,farms,session.today,tasks);
 if(session.draft.phase==='CONFIRMED'&&session.draft.action==='REPORT'){
  const task=records.find(t=>t.id===session.draft.taskId);if(!task||!session.draft.taskVersion)throw new AppError(409,'TASK_CHANGED','담당 작업이 변경됐어요. 새 대화에서 작업을 다시 골라 주세요.');
  const saved=await prisma.$transaction(async tx=>{await voiceAccess(tx,task.farmId,req.userId!,'task.complete');return farmCreateOnce(tx,`voice:${req.userId}`,session.id,{action:'REPORT',taskId:task.id,version:session.draft.taskVersion,evidenceFileId:req.body.evidenceFileId},()=>reportAssignedTask(tx,{farmId:task.farmId,actorId:req.userId!,taskId:task.id,version:session.draft.taskVersion!,key:session.id,evidenceFileId:req.body.evidenceFileId}));});session.draft={...session.draft,phase:'SAVED',resultId:(saved as {id:string}).id,question:'완료 보고를 저장했어요. 관리자가 결과를 확인합니다.'};
 }
 if(session.draft.phase==='CONFIRMED'){
  const farm=farms.find(f=>f.id===session.draft.farmId);if(!farm)throw new AppError(404,'FARM_NOT_FOUND','접근할 수 없는 농장입니다.');const payload=voicePayload(session.draft,farm);
  session.canAttachDiaryPhoto=farm.ownerId===req.userId!;
  const saved=await prisma.$transaction(async tx=>{if(collaboration)await voiceAccess(tx,farm.id,req.userId!,session.draft.action==='SCHEDULE'?'task.manage':'diary.create');else await lockFarm(tx,req.userId!,farm.id);return farmCreateOnce(tx,`voice:${req.userId}`,session.id,payload,async()=>{
   if('kind' in payload){if(await tx.farmRecord.count({where:{farmId:farm.id,kind:payload.kind,deletedAt:null}})>=1000)throw new AppError(409,'RESOURCE_LIMIT','농장 일정이 1,000개에 도달했습니다. 기존 일정을 정리해 주세요.');const item=await tx.farmRecord.create({data:{farmId:farm.id,kind:payload.kind,data:payload.data}});await audit(tx,req.userId!,'FARM_RECORD_CREATE',item.id);return {id:item.id};}
   if(collaboration)return createDiary(sqlClient(tx),{...payload,farmId:farm.id,actorId:req.userId!,key:session.id});
   const item=await tx.farmDiary.create({data:{farmId:farm.id,...payload}});await audit(tx,req.userId!,'DIARY_CREATE',item.id);return {id:item.id};
  });});session.draft={...session.draft,phase:'SAVED',resultId:(saved as {id:string}).id,question:session.draft.productUnknown?'저장했어요. 농약 이름·사용량·단위는 미확인으로 남겼어요.':'저장했어요.'};
 }
 session.version++;session.lastRequestId=req.body.requestId;
 const updated=await redis.eval('if redis.call("GET",KEYS[2])==ARGV[2] then redis.call("SET",KEYS[1],ARGV[1],"EX",1800); return 1 else return 0 end',{keys:[sessionKey,lock],arguments:[JSON.stringify({...session,farms:undefined}),lease]});if(updated!==1)throw new AppError(409,'VOICE_RETRY','저장 결과 확인을 위해 같은 요청으로 다시 시도해 주세요.');success(res,session);
 }finally{await redis.eval('if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',{keys:[lock],arguments:[lease]});}
}));
voiceRouter.get('/sessions/:id',validate('params',uuidSchema),asyncHandler(async(req,res)=>{await connectRedis();const raw=await redis.get(key(req.userId!,req.params.id!));if(!raw)throw new AppError(404,'VOICE_EXPIRED','대화가 만료되었습니다.');const session=JSON.parse(raw) as Session;await restrictSession(session,req.userId!,await accessibleVoiceFarms(req.userId!));success(res,session);}));
