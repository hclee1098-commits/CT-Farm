// 공개된 서울 중심 좌표로 공급자 응답만 검사합니다. 사용자 농장 좌표는 전송하지 않습니다.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { getFarmWeather } from '../apps/api/src/modules/farms/weather.service.ts';
process.env.APP_ENV='LOCAL';process.env.WEATHER_MODE='OPEN_METEO_NON_COMMERCIAL';
try {
  const result=await getFarmWeather(37.5665,126.9780);
  assert.equal(result.days.length,3);assert(result.days.every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day.date)));assert.equal(result.officialWarnings,false);
  const report={at:new Date().toISOString(),passed:true,provider:'Open-Meteo',days:result.days.length,coordinate:'공개 서울 중심 좌표',officialWarnings:false};
  await writeFile(new URL('../verification/ct-farm-weather.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch {
  await writeFile(new URL('../verification/ct-farm-weather.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),passed:false,reason:'외부 응답 또는 네트워크 검사 실패. 성공 처리하지 않았습니다.'},null,2));
  console.error('실제 날씨 공급자 검증 실패. 네트워크·공급자 상태를 확인해야 합니다.');process.exitCode=1;
}
