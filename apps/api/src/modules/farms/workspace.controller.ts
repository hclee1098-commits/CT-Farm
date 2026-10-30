import {Router} from 'express';
import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import {prisma} from '../../infrastructure/prisma';
import {requireAuth} from '../../common/auth.middleware';
import {asyncHandler,validate,uuidSchema} from '../../common/validate';
import {success} from '../../common/response';
import {AppError} from '../../common/app-error';
import {ownedFarm,lockFarm,audit,hashToken,notFound} from './operations.service';
const memberParams=z.object({id:z.string().uuid(),memberId:z.string().uuid()}).strict();
export const workspaceRouter=Router();workspaceRouter.use(requireAuth);

workspaceRouter.get('/dashboard',asyncHandler(async(req,res)=>{
 const ownerId=req.userId!;const farm={ownerId,deletedAt:null};
 const [farms,farmCount,entries,records,sensors,notifications,photos]=await prisma.$transaction([
  prisma.farm.findMany({where:farm,orderBy:{createdAt:'desc'},take:20,select:{id:true,name:true,crop:true,stage:true}}),
  prisma.farm.count({where:farm}),
  prisma.farmDiary.findMany({where:{deletedAt:null,farm},orderBy:[{workDate:'desc'},{id:'desc'}],take:5,select:{id:true,farmId:true,title:true,workDate:true}}),
  prisma.farmRecord.findMany({where:{deletedAt:null,farm,kind:{in:['TASK','CROP']}},orderBy:{createdAt:'desc'},take:200,select:{id:true,farmId:true,kind:true,data:true}}),
  prisma.farmSensor.findMany({where:{farm,revokedAt:null},take:100,select:{id:true,farmId:true,name:true,kind:true,simulated:true,readings:{orderBy:{measuredAt:'desc'},take:1,select:{value:true,measuredAt:true}}}}),
  prisma.notification.findMany({where:{userId:ownerId,readAt:null},orderBy:{createdAt:'desc'},take:5,select:{id:true,title:true,createdAt:true}}),
  prisma.diaryPhoto.findMany({where:{diary:{deletedAt:null,farm}},take:5,orderBy:{createdAt:'desc'},select:{id:true,diaryId:true,fileId:true}})
 ]);success(res,{farms,farmCount,entries,records,sensors,notifications,photos,limits:{farms:20,records:200,sensors:100},generatedAt:new Date().toISOString()});
}));

workspaceRouter.get('/farms/:id/members',validate('params',uuidSchema),asyncHandler(async(req,res)=>{
 await ownedFarm(req.userId!,req.params.id!);
 const [members,invitations,history]=await prisma.$transaction([
  prisma.farmMember.findMany({where:{farmId:req.params.id!},take:100,select:{id:true,role:true,revokedAt:true,user:{select:{name:true,email:true}}}}),
  prisma.farmInvitation.findMany({where:{farmId:req.params.id!},orderBy:{createdAt:'desc'},take:100,select:{id:true,email:true,expiresAt:true,usedAt:true,revokedAt:true}}),
  prisma.auditEvent.findMany({where:{targetId:req.params.id!,action:{startsWith:'FARM_MEMBER_'}},orderBy:{createdAt:'desc'},take:30,select:{id:true,action:true,createdAt:true}})
 ]);success(res,{members,invitations,history,supportedRoles:['OWNER','VIEWER']});
}));
workspaceRouter.post('/farms/:id/invitations',validate('params',uuidSchema),validate('body',z.object({email:z.string().trim().email().max(254)}).strict()),asyncHandler(async(req,res)=>{
 const email=(req.body.email as string).toLowerCase();const token=randomBytes(32).toString('base64url');
 const invitation=await prisma.$transaction(async tx=>{
  await lockFarm(tx,req.userId!,req.params.id!);
  const owner=await tx.user.findUniqueOrThrow({where:{id:req.userId!},select:{email:true}});
  if(email===owner.email.toLowerCase())throw new AppError(400,'OWNER_ALREADY_MEMBER','소유자는 이미 모든 권한을 가지고 있습니다.');
  if(await tx.farmInvitation.count({where:{farmId:req.params.id!,usedAt:null,revokedAt:null,expiresAt:{gt:new Date()}}})>=30)throw new AppError(409,'INVITATION_LIMIT','만료되지 않은 초대는 농장당 30개까지입니다.');
  await tx.farmInvitation.updateMany({where:{farmId:req.params.id!,email,usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
  const item=await tx.farmInvitation.create({data:{farmId:req.params.id!,email,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+24*3600000)},select:{id:true,expiresAt:true}});
  await audit(tx,req.userId!,'FARM_MEMBER_INVITE',req.params.id!);return item;
 });success(res,{...invitation,token,role:'VIEWER'},'초대 코드를 한 번만 표시합니다. 안전한 방법으로 전달하세요.',201);
}));
workspaceRouter.post('/invitations/accept',validate('body',z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict()),asyncHandler(async(req,res)=>{
 const result=await prisma.$transaction(async tx=>{
  const invitation=await tx.farmInvitation.findUnique({where:{tokenHash:hashToken(req.body.token)}});if(!invitation)throw notFound();
  // 해제와 수락을 같은 농장 행 잠금으로 직렬화합니다.
  await tx.$queryRaw`SELECT "id" FROM "Farm" WHERE "id"=${invitation.farmId} FOR UPDATE`;
  const user=await tx.user.findUniqueOrThrow({where:{id:req.userId!},select:{email:true,emailVerifiedAt:true}});
  if(!user.emailVerifiedAt)throw new AppError(403,'EMAIL_VERIFICATION_REQUIRED','초대받은 이메일을 먼저 인증해 주세요.');
  if(user.email.toLowerCase()!==invitation.email)throw notFound();
  const farm=await tx.farm.findFirst({where:{id:invitation.farmId,deletedAt:null,owner:{deletedAt:null,suspendedAt:null}}});if(!farm)throw notFound();
  if(farm.ownerId===req.userId!)throw new AppError(409,'OWNER_ALREADY_MEMBER','이미 농장 소유자입니다.');
  const accepted=await tx.farmInvitation.updateMany({where:{id:invitation.id,usedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}});if(accepted.count!==1)throw new AppError(409,'INVITATION_UNAVAILABLE','만료되었거나 사용·취소된 초대입니다.');
  const member=await tx.farmMember.upsert({where:{farmId_userId:{farmId:farm.id,userId:req.userId!}},create:{farmId:farm.id,userId:req.userId!,role:'VIEWER'},update:{role:'VIEWER',revokedAt:null}});
  await audit(tx,req.userId!,'FARM_MEMBER_ACCEPT',farm.id);return {farmId:farm.id,role:member.role};
 });success(res,result);
}));
workspaceRouter.delete('/farms/:id/members/:memberId',validate('params',memberParams),asyncHandler(async(req,res)=>{
 await prisma.$transaction(async tx=>{
  await lockFarm(tx,req.userId!,req.params.id!);
  const changed=await tx.farmMember.updateMany({where:{id:req.params.memberId!,farmId:req.params.id!,revokedAt:null},data:{revokedAt:new Date()}});if(changed.count!==1)throw notFound();
  const member=await tx.farmMember.findUniqueOrThrow({where:{id:req.params.memberId!},select:{user:{select:{email:true}}}});
  await tx.farmInvitation.updateMany({where:{farmId:req.params.id!,email:member.user.email.toLowerCase(),usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
  await audit(tx,req.userId!,'FARM_MEMBER_REVOKE',req.params.id!);
 });success(res,{revoked:true});
}));
workspaceRouter.delete('/farms/:id/invitations/:memberId',validate('params',memberParams),asyncHandler(async(req,res)=>{
 await prisma.$transaction(async tx=>{await lockFarm(tx,req.userId!,req.params.id!);const changed=await tx.farmInvitation.updateMany({where:{id:req.params.memberId!,farmId:req.params.id!,usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});if(changed.count!==1)throw notFound();await audit(tx,req.userId!,'FARM_MEMBER_INVITE_REVOKE',req.params.id!);});success(res,{revoked:true});
}));
workspaceRouter.get('/shared',asyncHandler(async(req,res)=>{
 const items=await prisma.farmMember.findMany({where:{userId:req.userId!,revokedAt:null,farm:{deletedAt:null,owner:{deletedAt:null,suspendedAt:null}}},take:100,select:{role:true,farm:{select:{id:true,name:true,crop:true,stage:true}}}});success(res,{items});
}));
workspaceRouter.get('/shared/:id',validate('params',uuidSchema),asyncHandler(async(req,res)=>{
 const farm=await prisma.farm.findFirst({where:{id:req.params.id!,deletedAt:null,owner:{deletedAt:null,suspendedAt:null},members:{some:{userId:req.userId!,role:'VIEWER',revokedAt:null}}},select:{id:true,name:true,crop:true,variety:true,stage:true,entries:{where:{deletedAt:null},orderBy:{workDate:'desc'},take:20,select:{id:true,title:true,workDate:true,content:true}},records:{where:{deletedAt:null,kind:{in:['CROP','TASK']}},take:100,select:{id:true,kind:true,data:true}}}});
 if(!farm)throw notFound();success(res,{farm,role:'VIEWER',limitations:'읽기 전용입니다. 사진·위치·장치 키·판매·결제·계정 정보는 공유하지 않습니다. 일지의 자유 텍스트에 개인정보를 적지 마세요.'});
}));
