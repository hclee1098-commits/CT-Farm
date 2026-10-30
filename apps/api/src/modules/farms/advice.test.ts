import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {prisma} from '../../infrastructure/prisma';
import {getFarmWeather} from './weather.service';
import {buildAdvice} from './operations.service';
vi.mock('../../infrastructure/prisma',()=>({prisma:{farm:{findFirst:vi.fn()},farmRecord:{findMany:vi.fn()},farmSensor:{findMany:vi.fn()},farmDiary:{findFirst:vi.fn()}}}));
vi.mock('./weather.service',()=>({getFarmWeather:vi.fn()}));
beforeEach(()=>{
  vi.mocked(prisma.farm.findFirst).mockResolvedValue({id:'farm',latitude:37,longitude:127} as never);
  vi.mocked(prisma.farmRecord.findMany).mockResolvedValue([]);
  vi.mocked(prisma.farmSensor.findMany).mockResolvedValue([]);
  vi.mocked(prisma.farmDiary.findFirst).mockResolvedValue({id:'diary'} as never);
});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe('농장 점검의 기상 근거와 결측',()=>{
  it('날씨 미설정을 안전 판정으로 바꾸지 않습니다',async()=>{
    vi.stubEnv('WEATHER_MODE','DISABLED');const result=await buildAdvice('owner','farm');expect(result.dataGaps).toHaveLength(1);expect(getFarmWeather).not.toHaveBeenCalled();expect(result.modelConnected).toBe(false);
  });
  it('연동 예보 위험의 출처·시각·참고 기준을 표시합니다',async()=>{
    vi.stubEnv('WEATHER_MODE','OPEN_METEO_NON_COMMERCIAL');
    vi.mocked(getFarmWeather).mockResolvedValue({fetchedAt:'2026-10-29T01:00:00Z',source:'Open-Meteo',officialWarnings:false,days:[{date:'2026-10-30',minC:0,maxC:20,rainMm:null,windMs:2,risks:['영하 예보: 현장 확인']}]});
    const result=await buildAdvice('owner','farm');expect(result.dataGaps).toHaveLength(0);expect(result.advice[0]?.source).toContain('Open-Meteo');expect(result.advice[0]?.reason).toContain('결측');expect(result.advice[0]?.reason).toContain('공식 특보가 아닌');
  });
  it('공급자 장애는 판단 불가로 남깁니다',async()=>{
    vi.stubEnv('WEATHER_MODE','OPEN_METEO_NON_COMMERCIAL');vi.mocked(getFarmWeather).mockRejectedValue(new Error('fixture unavailable'));
    const result=await buildAdvice('owner','farm');expect(result.advice).toHaveLength(0);expect(result.dataGaps[0]).toContain('판단하지 못했습니다');
  });
});
