// 협업 공통 모듈. 플랫폼 ADMIN 여부를 입력받지 않아 농장 권한 우회를 막습니다.
import {randomUUID,createHash} from 'node:crypto';
export type SQLClient={query(sql:string,params?:unknown[]):Promise<{rows:Record<string,any>[]}>};
export const capabilities:Readonly<Record<string,readonly string[]>>=Object.freeze({
 OWNER:['summary.read','diary.create','diary.update.any','task.manage','task.complete','crop.manage','member.manage','farm.archive','private.owner'],
 ADMIN:['summary.read','diary.create','diary.update.any','task.manage','task.complete','crop.manage'],
 WORKER:['summary.read','diary.create','diary.update.own','task.complete'],
 VIEWER:['summary.read']
});
export function allows(role:string|undefined,capability:string,{actorId,authorId}:{actorId?:string;authorId?:string|null}={}){
 const grants=role?capabilities[role]:undefined;if(!grants)return false;
 if(capability==='diary.update')return grants.includes('diary.update.any')||(grants.includes('diary.update.own')&&typeof actorId==='string'&&actorId===authorId);
 return grants.includes(capability);
}
// query는 반드시 트랜잭션 클라이언트여야 합니다. 변경·해제도 같은 농장 행을 먼저 잠급니다.
export async function authorize(tx:SQLClient,farmId:string,actorId:string,capability:string,context:{authorId?:string|null}={}){
 const result=await tx.query('SELECT f."ownerId", f."deletedAt", u."deletedAt" AS "ownerDeleted", u."suspendedAt" AS "ownerSuspended" FROM "Farm" f JOIN "User" u ON u.id=f."ownerId" WHERE f.id=$1 FOR UPDATE OF f',[farmId]);
 const farm=result.rows[0];if(!farm||farm.deletedAt||farm.ownerDeleted||farm.ownerSuspended)throw Error('FARM_NOT_FOUND');
 const user=await tx.query('SELECT id FROM "User" WHERE id=$1 AND "deletedAt" IS NULL AND "suspendedAt" IS NULL',[actorId]);if(!user.rows.length)throw Error('FARM_NOT_FOUND');
 let role='OWNER';if(farm.ownerId!==actorId){const members=await tx.query('SELECT role FROM "FarmMember" WHERE "farmId"=$1 AND "userId"=$2 AND "revokedAt" IS NULL',[farmId,actorId]);role=members.rows[0]?.role;}
 if(!allows(role,capability,{...context,actorId}))throw Error('FARM_NOT_FOUND');return role;
}
export async function changeRole(tx:SQLClient,{farmId,actorId,memberId,role}:{farmId:string;actorId:string;memberId:string;role:string|null}){
 if(!['ADMIN','WORKER','VIEWER',null].includes(role))throw Error('INVALID_ROLE');
 await authorize(tx,farmId,actorId,'member.manage');
 const updated=await tx.query('UPDATE "FarmMember" SET role=COALESCE($1,role), "revokedAt"=CASE WHEN $1 IS NULL THEN NOW() ELSE NULL END WHERE id=$2 AND "farmId"=$3 RETURNING "userId"',[role,memberId,farmId]);
 if(!updated.rows.length)throw Error('FARM_NOT_FOUND');
 await tx.query('UPDATE "FarmInvitation" SET "revokedAt"=NOW() WHERE "farmId"=$1 AND email=(SELECT LOWER(email) FROM "User" WHERE id=$2) AND "usedAt" IS NULL AND "revokedAt" IS NULL',[farmId,updated.rows[0]!.userId]);
 await tx.query('INSERT INTO "AuditEvent" (id,"actorId",action,"targetId","createdAt") VALUES (gen_random_uuid()::text,$1,$2,$3,NOW())',[actorId,role===null?`FARM_MEMBER_REVOKE_${memberId}`:`FARM_MEMBER_ROLE_${role}_${memberId}`,farmId]);
}
export async function editDiary(tx:SQLClient,{farmId,actorId,entryId,content,version}:{farmId:string;actorId:string;entryId:string;content:string;version:number}){
 // 동일 농장 잠금 아래 작성자 조회와 최종 권한 검사를 모두 수행합니다.
 await authorize(tx,farmId,actorId,'summary.read');
 const row=await tx.query('SELECT "createdById" FROM "FarmDiary" WHERE id=$1 AND "farmId"=$2 AND "deletedAt" IS NULL',[entryId,farmId]);if(!row.rows.length)throw Error('FARM_NOT_FOUND');
 await authorize(tx,farmId,actorId,'diary.update',{authorId:row.rows[0]!.createdById});
 if(typeof content!=='string'||content.length<1||content.length>5000)throw Error('INVALID_CONTENT');
 const result=await tx.query('UPDATE "FarmDiary" SET content=$1,version=version+1,"updatedAt"=NOW() WHERE id=$2 AND "farmId"=$3 AND version=$4 RETURNING id',[content,entryId,farmId,version]);if(!result.rows.length)throw Error('VERSION_CONFLICT');
 await tx.query('INSERT INTO "AuditEvent" (id,"actorId",action,"targetId","createdAt") VALUES (gen_random_uuid()::text,$1,$2,$3,NOW())',[actorId,'DIARY_UPDATE',entryId]);return result.rows[0];
}
export async function createDiary(tx:SQLClient,{farmId,actorId,title,content,workDate,key}:{farmId:string;actorId:string;title:string;content:string;workDate:string;key:string}){
 await authorize(tx,farmId,actorId,'diary.create');
 if(typeof title!=='string'||!title.length||title.length>120||typeof content!=='string'||!content.length||content.length>5000||!/^\d{4}-\d{2}-\d{2}$/.test(workDate)||new Date(workDate+'T00:00:00Z').toISOString().slice(0,10)!==workDate||! /^[A-Za-z0-9_-]{16,128}$/.test(key))throw Error('INVALID_DIARY');
 const scope=`collaboration-diary:${actorId}:${farmId}`,requestHash=createHash('sha256').update(JSON.stringify({title,content,workDate})).digest('hex');
 const previous=await tx.query('SELECT "requestHash",response FROM "IdempotentRequest" WHERE scope=$1 AND key=$2',[scope,key]);if(previous.rows.length){if(previous.rows[0]!.requestHash!==requestHash)throw Error('IDEMPOTENCY_CONFLICT');return previous.rows[0]!.response;}
 const id=randomUUID();await tx.query('INSERT INTO "FarmDiary" (id,"farmId","createdById",title,content,"workDate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',[id,farmId,actorId,title,content,workDate]);
 await tx.query('INSERT INTO "IdempotentRequest" (id,scope,key,"requestHash",response) VALUES ($1,$2,$3,$4,$5::jsonb)',[randomUUID(),scope,key,requestHash,JSON.stringify({id})]);
 await tx.query('INSERT INTO "AuditEvent" (id,"actorId",action,"targetId","createdAt") VALUES ($1,$2,$3,$4,NOW())',[randomUUID(),actorId,'DIARY_CREATE',id]);return {id};
}
export async function completeTask(tx:SQLClient,{farmId,actorId,recordId,version}:{farmId:string;actorId:string;recordId:string;version:number}){
 const role=await authorize(tx,farmId,actorId,'task.complete');
 const previous=await tx.query('SELECT data FROM "FarmRecord" WHERE id=$1 AND "farmId"=$2 AND kind=\'TASK\' AND "deletedAt" IS NULL',[recordId,farmId]);if(!previous.rows.length)throw Error('FARM_NOT_FOUND');
 if(role==='WORKER'&&previous.rows[0]!.data.assigneeId!==actorId)throw Error('FARM_NOT_FOUND');
 const status=role==='WORKER'?'REPORTED':'DONE';
 const row=await tx.query('UPDATE "FarmRecord" SET data=jsonb_set(data,\'{status}\',$4::jsonb),version=version+1,"updatedAt"=NOW() WHERE id=$1 AND "farmId"=$2 AND kind=\'TASK\' AND "deletedAt" IS NULL AND version=$3 RETURNING id',[recordId,farmId,version,JSON.stringify(status)]);if(!row.rows.length)throw Error('TASK_NOT_FOUND_OR_CONFLICT');
 await tx.query('INSERT INTO "AuditEvent" (id,"actorId",action,"targetId","createdAt") VALUES ($1,$2,$3,$4,NOW())',[randomUUID(),actorId,'FARM_TASK_COMPLETE',recordId]);return row.rows[0];
}
