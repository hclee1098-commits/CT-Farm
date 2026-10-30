import { prisma } from '../../infrastructure/prisma';
import { logger } from '../../infrastructure/logger';
import { notifyAdvice } from './operations.service';

// 단일 프로세스의 겹치는 실행을 방지하고, DB 멱등성으로 여러 인스턴스의 중복 알림도 막습니다.
export function startFarmAssistant() {
  if(process.env.FARM_ASSISTANT_ENABLED!=='true')return ()=>{};
  let running=false,stopped=false;
  const run=async()=>{
    if(running||stopped)return;running=true;
    try {
      let cursor:string|undefined;
      while(!stopped){
        const farms=await prisma.farm.findMany({where:{deletedAt:null,owner:{deletedAt:null,suspendedAt:null}},orderBy:{id:'asc'},take:50,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,ownerId:true}});
        if(!farms.length)break;
        for(const farm of farms){if(stopped)break;try{await notifyAdvice(farm.ownerId,farm.id);}catch{logger.warn({farmId:farm.id},'농장 자동 점검을 완료하지 못했습니다. 다음 주기에 재시도합니다.');}}
        cursor=farms[farms.length-1]!.id;
      }
    }catch{logger.warn('농장 자동 점검에 실패했습니다.');}finally{running=false;}
  };
  const timer=setInterval(()=>void run(),15*60*1000);timer.unref();void run();
  return ()=>{stopped=true;clearInterval(timer);};
}
