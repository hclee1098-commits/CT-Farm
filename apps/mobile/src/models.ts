export type Farm={id:string;name:string;address:string;latitude:number;longitude:number;areaM2:number;crop:string;variety:string;stage:string;version:number};
export type Page<T>={items:T[];page:number;totalPages:number;total:number};
export type Diary={id:string;farmId:string;title:string;content:string;workDate:string;version:number};
export type FarmRecord={id:string;farmId:string;kind:string;version:number;data:Record<string,any>};
export type Dashboard={farmCount:number;farms:Pick<Farm,'id'|'name'|'crop'|'stage'>[];entries:Pick<Diary,'id'|'farmId'|'title'|'workDate'>[];records:FarmRecord[];notifications:{id:string;title:string}[];photos:{fileId:string;diaryId:string}[];sensors:{id:string;name:string;simulated:boolean;readings:{value:number;measuredAt:string}[]}[]};
export const stageLabels:Record<string,string>={PREPARING:'준비 중',SOWING:'씨뿌리기·옮겨심기',GROWING:'자라는 중',HARVESTING:'수확 중',RESTING:'쉬는 밭'};
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
