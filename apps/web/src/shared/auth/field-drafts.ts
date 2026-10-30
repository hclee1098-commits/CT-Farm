// 메모는 기기 밖으로 전송하지 않습니다. 현재 탭에서만 최대 24시간 보존합니다.
const prefix='ctfarm.field.v1:';
const ttl=24*3600000;
export type FieldDraft={farmId:string;date:string;kind:string;memo:string;pending:{signature:string;key:string}|null};
type Store=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export function clearFieldDrafts(store:Store,keepUser?:string){for(let i=store.length-1;i>=0;i--){const k=store.key(i);if(k?.startsWith(prefix)&&(!keepUser||!k.startsWith(prefix+encodeURIComponent(keepUser)+':')))store.removeItem(k);}}
function key(user:string,mode:string){return prefix+encodeURIComponent(user)+':'+mode;}
export function readFieldDraft(store:Store,user:string,mode:string,now=Date.now()):FieldDraft|null{
 const k=key(user,mode);try{const raw=store.getItem(k);if(!raw)return null;const v=JSON.parse(raw);if(v.user!==user||v.expires<=now||v.expires>now+ttl||typeof v.data?.farmId!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.data.date)||typeof v.data.kind!=='string'||typeof v.data.memo!=='string'||v.data.memo.length>5000)throw Error('INVALID_DRAFT');
 if(v.data.pending!==null&&(!v.data.pending||typeof v.data.pending.signature!=='string'||v.data.pending.signature.length>20000||! /^[a-f0-9-]{36}$/.test(v.data.pending.key)))throw Error('INVALID_KEY');return v.data;
 }catch{store.removeItem(k);return null;}
}
export function saveFieldDraft(store:Store,user:string,mode:string,data:FieldDraft,now=Date.now()){store.setItem(key(user,mode),JSON.stringify({user,expires:now+ttl,data}));}
export function removeFieldDraft(store:Store,user:string,mode:string){store.removeItem(key(user,mode));}
