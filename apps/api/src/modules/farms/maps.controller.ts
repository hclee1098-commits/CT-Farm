import {Router} from 'express';
import {z} from 'zod';
import proj4 from 'proj4';
import {requireAuth} from '../../common/auth.middleware';
import {asyncHandler,validate,uuidSchema} from '../../common/validate';
import {success} from '../../common/response';
import {AppError} from '../../common/app-error';
import {prisma} from '../../infrastructure/prisma';
import {lockFarm,audit} from './operations.service';
import {simplePolygon} from './operations.dto';

const utmk='+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';
const coordinate=z.tuple([z.number().finite(),z.number().finite()]);
export const boundaryImport=z.object({sourceCrs:z.enum(['EPSG:4326','EPSG:5179']),coordinates:z.array(coordinate).min(3).max(200),name:z.string().trim().min(1).max(100),sourceId:z.string().trim().max(100).default('')}).strict();
export function normalizeBoundary(input:z.infer<typeof boundaryImport>){
  const boundary=input.coordinates.map(([x,y]):[number,number]=>{
    if(input.sourceCrs==='EPSG:5179'&&(x<500000||x>1500000||y<1000000||y>3000000))throw new AppError(400,'INVALID_COORDINATES','EPSG:5179의 easting, northing 순서를 확인해 주세요.');
    const converted=input.sourceCrs==='EPSG:5179'?proj4(utmk,'EPSG:4326',[x,y]):[x,y];
    const lon=converted[0]!,lat=converted[1]!;
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<124||lon>132||lat<32||lat>40)throw new AppError(400,'OUTSIDE_KOREA','팜맵 경계는 대한민국 인근 범위의 경도·위도를 확인해 주세요.');
    return [lon,lat];
  });
  if(!simplePolygon(boundary))throw new AppError(400,'INVALID_BOUNDARY','교차·중복 없는 경계를 입력하세요. 첫 점을 마지막에 반복하지 않습니다.');
  const metric=boundary.map(p=>proj4('EPSG:4326',utmk,p));const origin=metric[0]!;
  const relative=metric.map(p=>[p[0]!-origin[0]!,p[1]!-origin[1]!]);
  const areaM2=Math.abs(relative.reduce((sum,p,i)=>{const next=relative[(i+1)%relative.length]!;return sum+p[0]!*next[1]!-next[0]!*p[1]!;},0))/2;
  if(areaM2<=0||areaM2>1e9)throw new AppError(400,'INVALID_AREA','필지 면적 범위를 확인해 주세요.');
  return {boundary,areaM2,crs:'EPSG:4326',areaMethod:'EPSG:5179 평면 근사, 측량용 아님',sourceCrs:input.sourceCrs,sourceId:input.sourceId};
}
export const mapsRouter=Router();mapsRouter.use(requireAuth);
mapsRouter.get('/config',(_req,res)=>success(res,{naverKeyId:process.env.NAVER_MAP_KEY_ID||null,farmmapLive:false,farmmapImport:true,sourceCrs:'EPSG:5179',storedCrs:'EPSG:4326'}));
mapsRouter.post('/boundary/preview',validate('body',boundaryImport),asyncHandler(async(req,res)=>success(res,normalizeBoundary(req.body))));
export const plotImportRouter=Router();plotImportRouter.use(requireAuth);
plotImportRouter.post('/:id/plots/import',validate('params',uuidSchema),validate('body',boundaryImport),asyncHandler(async(req,res)=>{
  const result=normalizeBoundary(req.body);
  const record=await prisma.$transaction(async tx=>{
    await lockFarm(tx,req.userId!,req.params.id!);
    if(await tx.farmRecord.count({where:{farmId:req.params.id!,kind:'PLOT',deletedAt:null}})>=1000)throw new AppError(409,'RESOURCE_LIMIT','활성 필지 등록 한도를 초과했습니다.');
    const item=await tx.farmRecord.create({data:{farmId:req.params.id!,kind:'PLOT',data:{name:req.body.name,areaM2:result.areaM2,boundary:result.boundary},provenance:{sourceCrs:result.sourceCrs,sourceId:result.sourceId,method:result.areaMethod,source:'USER_IMPORT'}}});
    // 원본 식별자와 변환법은 검증 결과에만 반환하며 신뢰할 수 없는 원본 문자열을 감사 로그에 넣지 않습니다.
    await audit(tx,req.userId!,'PLOT_IMPORT',item.id);return item;
  });success(res,{record,conversion:result},'변환한 참고 경계를 등록했습니다. 공식 팜맵 API 조회 성공을 의미하지 않습니다.',201);
}));
