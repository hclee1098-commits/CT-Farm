// 다중 프로세스의 읽기-수정-저장을 직렬화합니다. 오래된 잠금을 임의 탈취하지 않습니다.
import fs from 'node:fs';
export function withStateLock(file,operation){
 const lock=file+'.lock';let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('INCIDENT_BUSY');throw e;}
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));return operation();}
 finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
