import { describe,it,expect,vi,afterEach } from 'vitest';
import { recordInput,simplePolygon,readingInput } from './operations.dto';
import { getFarmWeather } from './weather.service';
afterEach(()=>vi.unstubAllEnvs());
describe('농장 운영 입력·외부 장애 경계',()=>{
  it('교차·중복·일직선 경계를 거부합니다',()=>{
    expect(simplePolygon([[0,0],[1,1],[0,1],[1,0]])).toBe(false);
    expect(simplePolygon([[0,0],[1,0],[0,0]])).toBe(false);
    expect(simplePolygon([[0,0],[1,0],[2,0]])).toBe(false);
    expect(simplePolygon([[0,0],[1,0],[1,1],[0,1]])).toBe(true);
  });
  it('종류별 입력과 작기 날짜 순서를 검사합니다',()=>{
    expect(recordInput.safeParse({kind:'TASK',data:{title:'작업',dueDate:'2026-02-30',status:'TODO',memo:''}}).success).toBe(false);
    expect(recordInput.safeParse({kind:'CROP',data:{name:'감자',variety:'',stage:'GROWING',plantingDate:'2026-05-01',harvestDate:'2026-04-01',plotId:null}}).success).toBe(false);
  });
  it('오래되거나 미래의 센서 시각을 차단합니다',()=>{
    expect(readingInput.safeParse({sampleId:'test',value:30,measuredAt:new Date(Date.now()+600000).toISOString()}).success).toBe(false);
    expect(readingInput.safeParse({sampleId:'test',value:30,measuredAt:new Date(Date.now()-8*86400000).toISOString()}).success).toBe(false);
  });
  it('미설정 날씨는 외부 호출 없이 실패합니다',async()=>{
    vi.stubEnv('WEATHER_MODE','DISABLED');const fetcher=vi.fn();await expect(getFarmWeather(37,127,fetcher)).rejects.toMatchObject({statusCode:503});expect(fetcher).not.toHaveBeenCalled();
  });
  it('날씨 누락값을 0으로 바꾸지 않고 출처와 위험을 표시합니다',async()=>{
    vi.stubEnv('WEATHER_MODE','OPEN_METEO_NON_COMMERCIAL');vi.stubEnv('APP_ENV','LOCAL');
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({daily:{time:['2026-10-29'],temperature_2m_max:[34],temperature_2m_min:[null],precipitation_sum:[null],wind_speed_10m_max:[11]}})));
    const result=await getFarmWeather(37.2,127.2,fetcher);expect(result.officialWarnings).toBe(false);expect(result.days[0]?.minC).toBeNull();expect(result.days[0]?.risks.length).toBe(2);expect(result.source).toContain('Open-Meteo');
  });
  it('외부 오류·잘못된 응답은 비밀정보 없이 502입니다',async()=>{
    vi.stubEnv('WEATHER_MODE','OPEN_METEO_NON_COMMERCIAL');vi.stubEnv('APP_ENV','LOCAL');
    const fetcher=vi.fn().mockResolvedValue(new Response('{"secret":"never echo"}'));
    await expect(getFarmWeather(38,128,fetcher)).rejects.toMatchObject({statusCode:502,errorCode:'WEATHER_UNAVAILABLE'});
  });
});
