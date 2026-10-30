// 배포 백업의 인증을 확인해 새 파일로만 해제합니다. DB에 연결하지 않습니다.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function decryptDeploymentBackup(bytes,key){
 if(!Buffer.isBuffer(key)||key.length!==32||bytes.length<36||!bytes.subarray(0,8).equals(Buffer.from('SSV6DEP1')))throw Error('BACKUP_FORMAT');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(8,20));decipher.setAuthTag(bytes.subarray(-16));
 return Buffer.concat([decipher.update(bytes.subarray(20,-16)),decipher.final()]);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const [input,output]=process.argv.slice(2);if(!input||!output||!/^[a-f\d]{64}$/i.test(process.env.BACKUP_KEY||''))throw Error();const stat=fs.statSync(input);if(stat.size>1024*1024*1024)throw Error('BACKUP_TOO_LARGE');const bytes=decryptDeploymentBackup(fs.readFileSync(input),Buffer.from(process.env.BACKUP_KEY,'hex'));fs.writeFileSync(output,bytes,{flag:'wx',mode:0o600});console.info('인증된 새 파일 생성 완료. DB 변경 없음.');}catch{console.error('백업 해제 실패: 키·무결성·출력 경로를 확인하세요.');process.exitCode=1;}
}
