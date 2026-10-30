import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {AppError} from '../../common/app-error';
// 반드시 소유권 확인 및 동일 농장 행 잠금을 획득한 트랜잭션에서 사용합니다.
export async function farmCreateOnce<T extends object>(tx:Prisma.TransactionClient,scope:string,key:string|undefined,input:unknown,create:()=>Promise<T>){
 if(key===undefined)return create();
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new AppError(400,'INVALID_IDEMPOTENCY_KEY','중복 방지 키 형식을 확인해 주세요.');
 const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const existing=await tx.idempotentRequest.findUnique({where:{scope_key:{scope,key}}});
 if(existing){if(existing.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','같은 저장 요청의 내용이 달라졌습니다. 새 요청으로 저장해 주세요.');return existing.response;}
 const created=await create();const response=JSON.parse(JSON.stringify(created)) as Prisma.InputJsonValue;
 await tx.idempotentRequest.create({data:{scope,key,requestHash,response}});return created;
}
