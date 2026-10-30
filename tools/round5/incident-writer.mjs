// delivery.test.mjs가 생성한 임시 디렉터리에서만 사용합니다.
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {processIncidents} from '../monitoring/incidents.mjs';
const [dir,service]=process.argv.slice(2);
if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'ctfarm-round5-alert-'))throw Error('TEST_DIRECTORY_REQUIRED');
const event={id:crypto.randomUUID(),environment:'LOCAL',service,status:'down',kind:'health',level:'error',time:new Date().toISOString()};let done=false;
for(let i=0;i<100;i++){try{processIncidents(dir,'LOCAL',[event]);done=true;break;}catch(e){if(e.message!=='INCIDENT_BUSY')throw e;await new Promise(r=>setTimeout(r,10));}}if(!done)throw Error('LOCK_TIMEOUT');
