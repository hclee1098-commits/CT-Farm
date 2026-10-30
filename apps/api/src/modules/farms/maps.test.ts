import {describe,it,expect} from 'vitest';
import proj4 from 'proj4';
import {normalizeBoundary} from './maps.controller';
describe('팜맵 EPSG:5179 좌표 정확성',()=>{
  it('공식 FAQ의 변환 기준점과 1미터 이내로 일치합니다',()=>{
    const result=normalizeBoundary({name:'기준점',sourceId:'fixture',sourceCrs:'EPSG:5179',coordinates:[[984692.0210907353,1830469.4351968889],[984702.0210907353,1830469.4351968889],[984702.0210907353,1830479.4351968889],[984692.0210907353,1830479.4351968889]]});
    expect(result.boundary[0]![0]).toBeCloseTo(127.32912887285937,6);expect(result.boundary[0]![1]).toBeCloseTo(36.47171751842438,6);expect(result.areaM2).toBeCloseTo(100,2);
  });
  it('축 반전·잘못된 CRS·교차 경계를 차단합니다',()=>{
    expect(()=>normalizeBoundary({name:'반전',sourceId:'',sourceCrs:'EPSG:5179',coordinates:[[1830469,984692],[1830479,984692],[1830479,984702]]})).toThrow();
    expect(()=>normalizeBoundary({name:'교차',sourceId:'',sourceCrs:'EPSG:4326',coordinates:[[127,37],[127.001,37.001],[127,37.001],[127.001,37]]})).toThrow();
  });
});
