// 외부 SMTP 검증을 대신하지 않는 격리 브라우저 시험 fixture 설정입니다.
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import {PrismaClient} from '@prisma/client';
const report=JSON.parse(await fs.readFile('verification/ct-farm-round4-migration.json','utf8'));
if(!report.isolatedRestore||!/^ct_farm_verify_[a-f0-9]{12}$/.test(report.restoreDatabase))throw Error('격리 DB만 허용');
const env=dotenv.parse(await fs.readFile('apps/api/.env'));const url=new URL(env.DATABASE_URL);url.pathname='/'+report.restoreDatabase;
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('로컬 DB만 허용');
const p=new PrismaClient({datasourceUrl:url.toString()});
try{await p.user.update({where:{email:'round4-browser-viewer@example.test'},data:{emailVerifiedAt:new Date()}});console.log('격리 시험 계정 이메일 인증 fixture 설정. 실제 외부 메일 수신 검증 아님.');}finally{await p.$disconnect();}
