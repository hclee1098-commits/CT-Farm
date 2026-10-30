// React Native와 분리한 인증/통신 코어: 실제 HTTP와 주입 시험에서 같은 구현을 사용합니다.
export type User={id:string;name:string;email:string;role:string};
export type StoredSession={refreshToken:string;userId:string};
export interface Vault {read():Promise<StoredSession|null>;write(value:StoredSession):Promise<void>;clear():Promise<void>}
export class ApiError extends Error {constructor(public status:number,public code:string,message:string,public retryAfter=0){super(message);}}
export type SessionState={status:'loading'|'guest'|'ready'|'unavailable';user:User|null;message:string};
const validTokens=(data:any)=>typeof data?.accessToken==='string'&&data.accessToken.length>0&&data.accessToken.length<16384&&typeof data.refreshToken==='string'&&data.refreshToken.length>=40&&data.refreshToken.length<=256;
const validUser=(user:any):user is User=>typeof user?.id==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(user.id)&&typeof user.name==='string'&&typeof user.email==='string'&&['USER','ADMIN'].includes(user.role);
export function apiBase(value:string,development=false){
 const u=new URL(value),privateHost=/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(u.hostname);
 if(u.username||u.password||u.search||u.hash||u.pathname.replace(/\/$/,'')!=='/api/v1'||!(u.protocol==='https:'||development&&u.protocol==='http:'&&privateHost))throw Error('API 주소는 HTTPS /api/v1 형식으로 설정해 주세요.');
 return u.href.replace(/\/$/,'');
}
export class MobileClient {
 private access='';private generation=0;private queue:Promise<unknown>=Promise.resolve();private pendingRefresh:Promise<boolean>|null=null;private cooldown=0;
 private listeners=new Set<()=>void>();private state:SessionState={status:'loading',user:null,message:''};
 constructor(readonly base:string,private vault:Vault,private transport:typeof fetch=fetch,private onIdentityEnd:(userId?:string)=>Promise<void>=async()=>{}){}
 snapshot=()=>this.state;
 scope(userId:string):Pick<MobileClient,'request'>{const g=this.generation;if(this.state.user?.id!==userId)throw new ApiError(409,'SESSION_CHANGED','사용자 상태를 확인해 주세요.');return {request:<T>(route:string,init?:RequestInit)=>{this.check(g);return this.request<T>(route,init);}};}
 showLogin(){this.publish({status:'guest',user:null,message:'새 로그인 전까지 기기의 초안은 보존합니다.'});}
 subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
 private publish(s:SessionState){this.state=s;for(const f of this.listeners)f();}
 private serial<T>(f:()=>Promise<T>):Promise<T>{const next=this.queue.then(f,f);this.queue=next.catch(()=>{});return next;}
 private check(g:number){if(g!==this.generation)throw new ApiError(409,'SESSION_CHANGED','계정 상태가 바뀌었습니다. 다시 확인해 주세요.');}
 private async expire(){const owner=this.state.user?.id||(await this.vault.read())?.userId;this.generation++;this.access='';await this.vault.clear();await this.onIdentityEnd(owner);this.publish({status:'guest',user:null,message:'다시 로그인해 주세요.'});}
 private url(route:string){
  if(!route.startsWith('/')||route.startsWith('//')||route.includes('\\')||/[\u0000-\u0020\u007f]/.test(route))throw Error('허용되지 않은 API 경로입니다.');
  const full=new URL(this.base+route),base=new URL(this.base);
  if(full.origin!==base.origin||!full.pathname.startsWith(base.pathname+'/'))throw Error('API 경로를 확인해 주세요.');return full.href;
 }
 private async send(route:string,init:RequestInit={},token=''):Promise<{response:Response;data:any}>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000),headers=new Headers(init.headers);
  if(token)headers.set('Authorization','Bearer '+token);
  if(init.body&&!(init.body instanceof FormData))headers.set('Content-Type','application/json');
  try{
   const response=await this.transport(this.url(route),{...init,headers,credentials:'omit',redirect:'error',signal:controller.signal});
   let data:any;try{data=await response.json();}catch{throw new ApiError(response.status,'INVALID_RESPONSE','서버 응답을 확인할 수 없습니다. 저장 요청은 자동으로 다시 보내지 않습니다.');}
   if(!response.ok){const retry=Math.min(3600,Math.max(0,Number(response.headers.get('Retry-After'))||0));throw new ApiError(response.status,data.error?.code||data.errorCode||data.code||'REQUEST_FAILED',data.error?.message||data.message||'요청을 완료하지 못했습니다.',retry);}
   if(data.success!==true||!('data' in data))throw new ApiError(502,'INVALID_RESPONSE','서버 응답 형식이 다릅니다.');
   return {response,data:data.data};
  }catch(e){if(e instanceof ApiError)throw e;throw new ApiError(0,'NETWORK','서버에 연결하지 못했습니다. 입력 내용은 보존됩니다.');}
  finally{clearTimeout(timeout);}
 }
 async initialize(){this.publish({status:'loading',user:null,message:''});try{if(!await this.refresh())return;}catch(e){this.publish({status:'unavailable',user:null,message:e instanceof Error?e.message:'연결을 확인해 주세요.'});}}
 async login(input:{email:string;password:string;mfaCode?:string},registerName?:string){
  const g=++this.generation;
  return this.serial(async()=>{
   const {data}=await this.send('/auth/mobile/'+(registerName?'register':'login'),{method:'POST',body:JSON.stringify(registerName?{email:input.email,password:input.password,name:registerName}:input)});
   this.check(g);if(!validUser(data.user)||!validTokens(data))throw new ApiError(502,'INVALID_RESPONSE','로그인 응답을 확인해 주세요.');
   this.access='';const prior=await this.vault.read().catch(()=>null),priorOwner=this.state.user?.id||prior?.userId;await this.vault.clear();await this.onIdentityEnd(priorOwner);
   await this.vault.write({refreshToken:data.refreshToken,userId:data.user.id});this.check(g);
   this.access=data.accessToken;this.cooldown=0;this.publish({status:'ready',user:data.user,message:''});
  });
 }
 async refresh():Promise<boolean>{
  if(this.pendingRefresh)return this.pendingRefresh;
  if(Date.now()<this.cooldown)throw new ApiError(429,'RATE_LIMIT','잠시 뒤 로그인 상태를 다시 확인해 주세요.',Math.ceil((this.cooldown-Date.now())/1000));
  const g=this.generation;
  const task=this.serial(async()=>{
   const stored=await this.vault.read();this.check(g);
   if(!stored){this.publish({status:'guest',user:null,message:''});return false;}
   try{
    const {data}=await this.send('/auth/mobile/refresh',{method:'POST',body:JSON.stringify({refreshToken:stored.refreshToken})});this.check(g);
    if(!validTokens(data))throw new ApiError(502,'INVALID_RESPONSE','로그인 갱신 응답을 확인해 주세요.');
    // Rotation 응답을 먼저 안전한 저장소에 반영합니다. 연결 장애는 기존 초안을 지우지 않습니다.
    await this.vault.write({refreshToken:data.refreshToken,userId:stored.userId});this.check(g);this.access=data.accessToken;
    const {data:user}=await this.send('/auth/me',{},this.access);this.check(g);
    if(!validUser(user)||user.id!==stored.userId){await this.expire();throw new ApiError(401,'IDENTITY_MISMATCH','계정을 다시 확인해 주세요.');}
    this.publish({status:'ready',user,message:''});return true;
   }catch(e){this.check(g);if(e instanceof ApiError&&e.status===401){await this.expire();return false;}if(e instanceof ApiError&&e.status===429)this.cooldown=Date.now()+Math.max(1000,e.retryAfter*1000);throw e;}
  });
  this.pendingRefresh=task;try{return await task;}finally{if(this.pendingRefresh===task)this.pendingRefresh=null;}
 }
 async request<T>(route:string,init:RequestInit={}):Promise<T>{
  const g=this.generation,method=(init.method||'GET').toUpperCase();
  if(!this.access){if(!await this.refresh())throw new ApiError(401,'LOGIN_REQUIRED','로그인해 주세요.');}this.check(g);
  try{const r=await this.send(route,init,this.access);this.check(g);return r.data as T;}
  catch(e){this.check(g);if(e instanceof ApiError&&e.status===401){
   if(!await this.refresh())throw e;this.check(g);
   // 변경 요청은 응답 유실 여부를 모릅니다. 사용자의 수동 확인 뒤 같은 키로 재시도합니다.
   if(method==='GET'||method==='HEAD'){const r=await this.send(route,init,this.access);this.check(g);return r.data as T;}
   throw new ApiError(409,'RETRY_CONFIRM','로그인을 갱신했습니다. 저장 여부를 확인한 뒤 다시 눌러 주세요.');
  }throw e;}
 }
 async image(fileId:string):Promise<{mime:string;bytes:Uint8Array}>{
  if(!/^[a-f\d-]{36}$/i.test(fileId))throw Error('사진 식별자를 확인해 주세요.');
  const g=this.generation;if(!this.access&&!await this.refresh())throw new ApiError(401,'LOGIN_REQUIRED','로그인해 주세요.');this.check(g);
  const read=async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{
   const r=await this.transport(this.url('/files/'+fileId+'/thumbnail'),{headers:{Authorization:'Bearer '+this.access},credentials:'omit',redirect:'error',signal:controller.signal});
   if(!r.ok)throw new ApiError(r.status,'PHOTO_FAILED','사진을 불러오지 못했습니다.');
   const mime=r.headers.get('Content-Type')?.split(';')[0]||'';if(!['image/jpeg','image/png','image/webp'].includes(mime)||Number(r.headers.get('Content-Length'))>2*1024*1024)throw Error('사진 응답을 확인해 주세요.');
   const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>2*1024*1024)throw Error('사진 크기를 확인해 주세요.');this.check(g);return {mime,bytes};
  }finally{clearTimeout(timer);}};
  try{return await read();}catch(e){this.check(g);if(e instanceof ApiError&&e.status===401&&await this.refresh()){this.check(g);return read();}throw e;}
 }
 async logout(){
  ++this.generation;this.access='';
  return this.serial(async()=>{let stored:StoredSession|null=null,error:unknown;try{stored=await this.vault.read();if(stored)await this.send('/auth/mobile/logout',{method:'POST',body:JSON.stringify({refreshToken:stored.refreshToken})});}catch(e){error=e;}
   const owner=this.state.user?.id||stored?.userId;await this.vault.clear();await this.onIdentityEnd(owner);this.publish({status:'guest',user:null,message:error?'기기에서는 로그아웃했습니다. 서버 세션 해제는 연결 후 계정 보안에서 확인해 주세요.':''});
  });
 }
}
