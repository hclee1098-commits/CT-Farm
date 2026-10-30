// 원본은 읽기만 합니다. 시험 계정 혼입·기존 파일 변경 여부를 숫자로 기록합니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import {PrismaClient} from '@prisma/client';
import {decryptBackup} from './backup.mjs';
const root=process.cwd(),env=dotenv.parse(await fs.readFile('apps/api/.env'));const url=new URL(env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname)||/^\/ct_farm_verify_/.test(url.pathname))throw Error('원래 로컬 설정의 읽기 검사만 허용');
const p=new PrismaClient({datasourceUrl:url.toString()});
try{
 const emails=['round4-browser-owner@example.test','round4-browser-viewer@example.test'];
 const users=await p.user.count({where:{email:{in:emails}}}),invites=await p.farmInvitation.count({where:{email:{in:emails}}});
 if(users||invites)throw Error('원본에서 합성 QA 계정 또는 초대가 발견됨: 조사 필요');
 const migration=JSON.parse(await fs.readFile('verification/ct-farm-round4-migration.json','utf8'));
 const payload=decryptBackup(await fs.readFile(migration.backup),await fs.readFile('.starter-state/ct-farm-backup.key'));
 const uploads=path.resolve(root,'apps/api',env.UPLOAD_DIR||'uploads');let matches=0;
 for(const f of payload.files){const hash=createHash('sha256').update(await fs.readFile(path.join(uploads,f.name))).digest('hex');if(hash!==f.sha256)throw Error('원래 파일의 백업 대비 해시 변경: 조사 필요');matches++;}
 const proof={at:new Date().toISOString(),sourceAccess:'read only',qaUsersInSource:users,qaInvitationsInSource:invites,originalUploadsMatchingBackup:matches,originalTablesPreservedAtMigration:migration.preservedTables,resetPerformed:false,volumeDeletionPerformed:false};
 await fs.writeFile('verification/ct-farm-round4-safety.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await p.$disconnect();}
