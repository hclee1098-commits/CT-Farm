import { z } from 'zod';
export const version = z.number().int().min(1).max(2147483646);
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(v + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}, '실제 존재하는 날짜를 입력해 주세요.');
const coordinate = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-85).max(85)]);
// 경계는 닫는 점을 중복 입력하지 않는 단순 다각형입니다. 교차·중복·일직선은 거부합니다.
export function simplePolygon(points: [number,number][]) {
  if (new Set(points.map(p => p.join(','))).size !== points.length) return false;
  const cross = (a: [number,number], b: [number,number], c: [number,number]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let area = 0;
  for (let i=0; i<points.length; i++) {
    const a=points[i]!, b=points[(i+1)%points.length]!; area += a[0]*b[1]-b[0]*a[1];
    for(let j=i+1; j<points.length; j++) {
      if(j===i+1 || (i===0 && j===points.length-1)) continue;
      const c=points[j]!, d=points[(j+1)%points.length]!;
      const bounds = Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0])) && Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));
      if(bounds && cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0) return false;
    }
  }
  return Math.abs(area)>1e-12;
}
const text = (max: number) => z.string().trim().min(1).max(max);
export const recordSchemas = {
  PLOT: z.object({ name: text(100), areaM2: z.number().finite().positive().max(1e9), boundary: z.array(coordinate).min(3).max(200).refine(simplePolygon, '중복·교차 없는 경계를 입력해 주세요.') }).strict(),
  CROP: z.object({ name: text(80), variety: z.string().trim().max(80), stage: z.enum(['PREPARING','SOWING','GROWING','HARVESTING','RESTING']), plantingDate: dateOnly, harvestDate: dateOnly, plotId: z.string().uuid().nullable() }).strict().refine(d => d.harvestDate>=d.plantingDate, '수확일은 파종·정식일 이후여야 합니다.'),
  TASK: z.object({ title: text(120), dueDate: dateOnly, status: z.enum(['TODO','DONE','CANCELLED']), memo: z.string().trim().max(2000) }).strict(),
  LEDGER: z.object({ title: text(120), date: dateOnly, type: z.enum(['INCOME','EXPENSE']), amountWon: z.number().int().min(1).max(1_000_000_000), memo: z.string().trim().max(2000) }).strict(),
  HARVEST: z.object({ crop: text(80), date: dateOnly, quantityKg: z.number().finite().positive().max(1e7), memo: z.string().trim().max(2000) }).strict()
};
export const recordKind = z.enum(['PLOT','CROP','TASK','LEDGER','HARVEST']);
export const recordQuery = z.object({ kind: recordKind, page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const recordInput = z.object({kind:recordKind,data:z.unknown()}).strict().superRefine((input,ctx)=>{
  const parsed=recordSchemas[input.kind].safeParse(input.data);
  if(!parsed.success) for(const issue of parsed.error.issues) ctx.addIssue({code:'custom',path:['data',...issue.path],message:issue.message});
}).transform(input=>({kind:input.kind,data:recordSchemas[input.kind].parse(input.data)}));
export const childParams = z.object({ id: z.string().uuid(), childId: z.string().uuid() }).strict();
export const recordUpdate = z.object({ version, data: z.unknown() }).strict();
export const photoInput = z.object({ fileId: z.string().uuid(), caption: z.string().trim().max(200) }).strict();
export const photoParams = z.object({ id: z.string().uuid(), childId: z.string().uuid(), photoId: z.string().uuid() }).strict();
export const sensorInput = z.object({ name: text(100), kind: z.enum(['MOISTURE','TEMPERATURE','HUMIDITY']), minValue: z.number().finite().min(-80).max(100), maxValue: z.number().finite().min(-80).max(100), staleMinutes: z.number().int().min(1).max(10080), simulated: z.boolean() }).strict().refine(d => d.minValue<d.maxValue && (d.kind==='TEMPERATURE'||d.minValue>=0), '센서 종류에 맞는 최소·최대 범위를 입력해 주세요.');
export const readingInput = z.object({ sampleId: text(80), value: z.number().finite().min(-80).max(100), measuredAt: z.iso.datetime({ offset: true }) }).strict().refine(d => {
  const age = Date.now()-Date.parse(d.measuredAt); return age>=-300000 && age<=7*86400000;
}, '측정 시각은 최근 7일 이내이고 미래 5분 이내여야 합니다.');
export const productInput = z.object({ name: text(120), unit: text(40), priceWon: z.number().int().min(1).max(100000000), stock: z.number().int().min(0).max(1000000) }).strict();
export const productUpdate = productInput.extend({ version });
export const orderInput = z.object({ requestKey: z.string().uuid(), buyerLabel: text(80), quantity: z.number().int().min(1).max(1000000) }).strict();
export const orderStatus = z.object({ status: z.enum(['COMPLETED','CANCELLED']) }).strict();
