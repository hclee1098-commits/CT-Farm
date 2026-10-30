// 기기 API와 분리해 만료·계정 격리·로그아웃과 동시 쓰기를 같은 구현으로 검사합니다.
export interface DraftKV {get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;remove(key:string):Promise<void>}
const kinds=['diary','schedule','farm','voice'];
export function createDraftStore(kv:DraftKV,currentOwner:()=>Promise<string|undefined>,now=Date.now){
 let queue:Promise<unknown>=Promise.resolve();const keys=new Set<string>();
 const serial=<T>(run:()=>Promise<T>)=>{const task=queue.then(run,run);queue=task.catch(()=>{});return task;};
 const key=(owner:string,kind:string)=>{if(!kinds.includes(kind)||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(owner))throw Error('초안 식별자를 확인해 주세요.');return `ctfarm.draft.${owner}.${kind}`;};
 return {
  read<T>(owner:string,kind:string):Promise<T|null>{return serial(async()=>{if(await currentOwner()!==owner)throw Error('계정이 바뀌었습니다.');const k=key(owner,kind);keys.add(k);const raw=await kv.get(k);if(!raw)return null;const d=JSON.parse(raw);if(d.owner!==owner||!Number.isFinite(d.expiresAt)||d.expiresAt<=now()){await kv.remove(k);return null;}return d.data;});},
  write(owner:string,kind:string,data:unknown){return serial(async()=>{if(await currentOwner()!==owner)throw Error('계정이 바뀌었습니다.');const k=key(owner,kind);keys.add(k);await kv.set(k,JSON.stringify({owner,expiresAt:now()+86400000,data}));});},
  remove(owner:string,kind:string){return serial(async()=>{const k=key(owner,kind);await kv.remove(k);keys.delete(k);});},
  clearUser(owner:string){return serial(async()=>{for(const kind of kinds){const k=key(owner,kind);await kv.remove(k);keys.delete(k);}});},
  clear(){return serial(async()=>{for(const k of keys)await kv.remove(k);keys.clear();});}
 };
}
