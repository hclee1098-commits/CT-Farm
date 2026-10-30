// 테스트 전용 Redis: 기존 컨테이너·볼륨을 재사용하거나 삭제하지 않습니다.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,createHash} from 'node:crypto';
import {createClient} from 'redis';
const exec=promisify(execFile);
export async function startDockerRedis(port){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('시험 Redis 포트 오류');
 const name='ctfarm-test-redis-'+randomBytes(8).toString('hex');
 let id;
 try{
  // 이미지 자동 다운로드를 금지합니다. /data tmpfs로 익명·영구 볼륨을 만들지 않습니다.
  const workspace=createHash('sha256').update(process.cwd().toLowerCase()).digest('hex');
  const r=await exec('docker',['run','--pull=never','--detach','--rm','--name',name,'--label','ct-farm.test=isolated-redis','--label','ct-farm.workspace='+workspace,'--read-only','--tmpfs','/data:rw,size=16m','--user','redis','--cap-drop=ALL','--security-opt','no-new-privileges','-p',`127.0.0.1:${port}:6379`,'redis:7-alpine','redis-server','--save','','--appendonly','no'],{timeout:20000,windowsHide:true});
  id=r.stdout.trim();if(!/^[a-f0-9]{64}$/.test(id))throw Error('시험 컨테이너 ID 오류');
  for(let attempt=0;attempt<30;attempt++){
   const client=createClient({url:`redis://127.0.0.1:${port}`,socket:{reconnectStrategy:false,connectTimeout:500}});client.on('error',()=>{});
   try{await client.connect();await client.ping();await client.quit();return {id,name,port,stop:async()=>{await exec('docker',['stop','--time','3',id],{timeout:10000,windowsHide:true});}};}
   catch{if(client.isOpen)client.destroy();await new Promise(r=>setTimeout(r,100));}
  }
  throw Error('시험 Redis 준비 시간 초과');
 }catch{
  if(id&&/^[a-f0-9]{64}$/.test(id))await exec('docker',['stop','--time','3',id],{timeout:10000,windowsHide:true}).catch(()=>{});
  throw Error('격리 Redis 시작 실패: Docker와 로컬 redis:7-alpine 이미지 또는 REDIS_SERVER_BIN 설정을 확인하세요.');
 }
}
