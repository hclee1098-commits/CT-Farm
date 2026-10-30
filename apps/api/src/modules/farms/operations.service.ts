import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/prisma';
import { AppError } from '../../common/app-error';
import { createHash } from 'node:crypto';
import { recordSchemas, readingInput } from './operations.dto';
import { getFarmWeather } from './weather.service';

export const notFound = () => new AppError(404, 'FARM_RESOURCE_NOT_FOUND', '농장 또는 자료를 찾을 수 없습니다.');
export const conflict = () => new AppError(409, 'VERSION_CONFLICT', '자료가 변경되었습니다. 새로 불러와 주세요.');
export async function ownedFarm(ownerId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({ where: { id: farmId, ownerId, deletedAt: null } });
  if (!farm) throw notFound();
  return farm;
}
export async function lockFarm(tx: Prisma.TransactionClient, ownerId: string, farmId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Farm" WHERE "id"=${farmId} AND "ownerId"=${ownerId} AND "deletedAt" IS NULL FOR UPDATE`;
  if (!rows.length) throw notFound();
}
export async function audit(tx: Prisma.TransactionClient, ownerId: string, action: string, targetId: string) {
  await tx.auditEvent.create({ data: { actorId: ownerId, action, targetId } });
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const publicSensor = { id: true, farmId: true, name: true, kind: true, minValue: true, maxValue: true, staleMinutes: true, simulated: true, revokedAt: true, createdAt: true } as const;

export async function acceptReading(sensorId: string, raw: unknown, options: { ownerId?: string; tokenHash?: string; simulator?: boolean }) {
  const input = readingInput.parse(raw);
  return prisma.$transaction(async tx => {
    const sensor = await tx.farmSensor.findFirst({ where: { id: sensorId, revokedAt: null, ...(options.tokenHash ? { tokenHash: options.tokenHash } : {}), farm: { deletedAt: null, ...(options.ownerId ? { ownerId: options.ownerId } : {}), owner: { deletedAt: null, suspendedAt: null } } } });
    if (!sensor) throw notFound();
    await lockFarm(tx, (await tx.farm.findUniqueOrThrow({ where: { id: sensor.farmId } })).ownerId, sensor.farmId);
    // 자격 폐기 역시 농장 잠금을 사용합니다. 잠금 획득 후 자격을 재검사합니다.
    if (!await tx.farmSensor.findFirst({ where: { id: sensorId, revokedAt: null, tokenHash: sensor.tokenHash } })) throw notFound();
    if (!!options.simulator !== sensor.simulated) throw new AppError(400, 'SENSOR_MODE_MISMATCH', '시험 센서와 실제 센서의 입력 경로를 구분해 주세요.');
    if (sensor.kind!=='TEMPERATURE' && input.value<0) throw new AppError(400, 'INVALID_READING', '수분·습도는 0~100%여야 합니다.');
    const existing = await tx.sensorReading.findUnique({ where: { sensorId_sampleId: { sensorId, sampleId: input.sampleId } } });
    if (existing) {
      if (existing.value!==input.value || existing.measuredAt.getTime()!==Date.parse(input.measuredAt)) throw new AppError(409, 'SAMPLE_CONFLICT', '같은 측정 식별자의 값이 다릅니다.');
      return existing;
    }
    return tx.sensorReading.create({ data: { ...input, sensorId, measuredAt: new Date(input.measuredAt) } });
  });
}
export type Advice = { key: string; title: string; reason: string; severity: 'INFO'|'WARNING'; source: string };
export async function buildAdvice(ownerId: string, farmId: string, now = new Date()) {
  const farm = await ownedFarm(ownerId, farmId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric',month:'2-digit',day:'2-digit' }).format(now);
  const [records, sensors, diary] = await Promise.all([
    prisma.farmRecord.findMany({ where: { farmId, deletedAt: null, kind: { in: ['TASK','CROP'] } }, take: 1000 }),
    prisma.farmSensor.findMany({ where: { farmId, revokedAt: null }, include: { readings: { orderBy: { measuredAt: 'desc' }, take: 1 } }, take: 200 }),
    prisma.farmDiary.findFirst({ where: { farmId, deletedAt: null }, orderBy: { workDate: 'desc' } })
  ]);
  const advice: Advice[] = [];
  for (const record of records) {
    if (record.kind==='TASK') {
      const task = recordSchemas.TASK.safeParse(record.data);
      if (task.success && task.data.status==='TODO' && task.data.dueDate<=today) advice.push({ key: 'task:'+record.id, title: task.data.title, reason: `작업 예정일 ${task.data.dueDate}. 완료 여부를 확인해 주세요.`, severity:'INFO', source:'사용자 작업 일정' });
    } else {
      const crop = recordSchemas.CROP.safeParse(record.data);
      if(crop.success && crop.data.harvestDate<=today && crop.data.stage!=='RESTING') advice.push({ key:'crop:'+record.id,title:`${crop.data.name} 수확 계획 확인`,reason:`사용자가 기록한 수확 예정일 ${crop.data.harvestDate}. 실제 성숙 상태를 직접 확인해 주세요.`,severity:'INFO',source:'사용자 재배 이력' });
    }
  }
  for (const sensor of sensors) {
    const last = sensor.readings[0];
    const label = sensor.simulated ? '[시험 데이터] ' : '';
    if (!last || now.getTime()-last.measuredAt.getTime()>sensor.staleMinutes*60000) advice.push({ key:'offline:'+sensor.id,title:label+sensor.name+' 통신·측정 확인',reason:`최근 ${sensor.staleMinutes}분 내 유효한 측정값이 없습니다.`,severity:'WARNING',source:'센서 측정 시각' });
    else if(last.value<sensor.minValue || last.value>sensor.maxValue) advice.push({ key:'range:'+sensor.id,title:label+sensor.name+' 설정 범위 이탈',reason:`측정 ${last.value}, 사용자 설정 범위 ${sensor.minValue}~${sensor.maxValue}. 센서와 현장을 확인해 주세요.`,severity:'WARNING',source:`센서 측정 ${last.measuredAt.toISOString()}` });
  }
  if (!diary) advice.push({ key:'diary',title:'첫 영농일지를 남겨 주세요',reason:'활성 영농일지가 없어 작업 이력을 확인할 수 없습니다.',severity:'INFO',source:'농장 영농일지' });
  const dataGaps:string[]=[];
  if(process.env.WEATHER_MODE&&process.env.WEATHER_MODE!=='DISABLED'){
    try{
      const weather=await getFarmWeather(farm.latitude,farm.longitude);
      for(const day of weather.days) for(const risk of day.risks) advice.push({key:`weather:${day.date}:${risk}`,title:`${day.date} 기상 확인`,reason:`${risk}. 예보 최저 ${day.minC??'결측'}°C, 최고 ${day.maxC??'결측'}°C, 강수 ${day.rainMm??'결측'}mm, 풍속 ${day.windMs??'결측'}m/s. 공식 특보가 아닌 참고 기준입니다.`,severity:'WARNING',source:`${weather.source} 조회 ${weather.fetchedAt}`});
    }catch{dataGaps.push('날씨 공급자 장애로 이번 점검에서 기상 위험을 판단하지 못했습니다.');}
  }else dataGaps.push('날씨가 미설정되어 기상 위험은 점검하지 않았습니다.');
  return { generatedAt: now.toISOString(), engine:'rules-v1', modelConnected:false, limitation:'사용자 일정·센서 설정·연동된 예보에 따른 확인 안내입니다. 작물 진단이나 비료·농약 처방을 제공하지 않습니다.', dataGaps, advice, automaticActions:['SAVE_NOTIFICATION'],confirmationRequiredActions:['CREATE_TASK'],remoteControlEnabled:false,truncated: records.length===1000 || sensors.length===200 };
}
export async function notifyAdvice(ownerId: string, farmId: string) {
  const result = await buildAdvice(ownerId, farmId);
  const day = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Seoul' });
  return prisma.$transaction(async tx => {
    await lockFarm(tx, ownerId, farmId);
    let created = 0;
    for (const item of result.advice.slice(0, 100)) {
      const scope = `farm-alert:${ownerId}:${farmId}`;
      const key = day+':'+hashToken(item.key+item.reason);
      if(await tx.idempotentRequest.findUnique({ where:{ scope_key:{scope,key} } })) continue;
      await tx.notification.create({ data:{ userId:ownerId,title:item.title.slice(0,120),message:item.reason.slice(0,2000) } });
      await tx.idempotentRequest.create({ data:{scope,key,requestHash:hashToken(item.key),response:{created:true}} }); created++;
    }
    return { created, ...result };
  });
}
