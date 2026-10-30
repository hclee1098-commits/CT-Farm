import test from 'node:test';
import assert from 'node:assert/strict';
import {probeDisks} from './disks.mjs';
test('DB·사진·백업 디스크를 개별 판정하고 경로를 결과에 노출하지 않음',()=>{
 const results=probeDisks({database:'db-private',uploads:'upload-private',backup:'missing'},100,path=>{if(path==='missing')throw Error('fixture');return {bavail:path==='db-private'?1:100,bsize:10};});assert.deepEqual(results.map(x=>x.status),['down','up','unknown']);assert(!JSON.stringify(results).includes('private'));assert(probeDisks({}).every(x=>x.status==='unknown'&&!x.configured));
});
