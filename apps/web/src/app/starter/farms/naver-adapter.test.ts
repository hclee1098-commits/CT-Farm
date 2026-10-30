import {describe,it,expect,vi} from 'vitest';
import {approximateArea,mountNaverMap,type NaverSdk} from './naver-adapter';
describe('지도 공급자 경계와 면적',()=>{
  it('위도/경도 순서를 SDK에서 바꾸고 자원을 해제합니다',()=>{
    const coordinates:number[][]=[],detach=vi.fn(),remove=vi.fn(),empty=vi.fn();let handler:((event:{coord:{lat():number;lng():number}})=>void)|undefined;
    const sdk={LatLng:class{constructor(lat:number,lon:number){coordinates.push([lat,lon]);}},Map:class{},Marker:class{setMap=detach;},Polygon:class{setMap=detach;},Event:{addListener:vi.fn((_map,_type,callback)=>{handler=callback;return 'listener';}),removeListener:remove}} as NaverSdk;
    const picked=vi.fn();const dispose=mountNaverMap(sdk,{replaceChildren:empty} as unknown as HTMLElement,37,127,[[127,37],[127.001,37],[127.001,37.001]],picked);
    expect(coordinates).toContainEqual([37.001,127.001]);handler?.({coord:{lat:()=>37.5,lng:()=>127.5}});expect(picked).toHaveBeenCalledWith(37.5,127.5);dispose();expect(remove).toHaveBeenCalledWith('listener');expect(detach).toHaveBeenCalledTimes(2);expect(empty).toHaveBeenCalled();
  });
  it('경계 방향과 무관하게 작은 정사각형의 근사 면적을 계산합니다',()=>{
    const shape:[number,number][]=[[0,0],[.001,0],[.001,.001],[0,.001]];expect(approximateArea(shape)).toBeCloseTo(12364,0);expect(approximateArea([...shape].reverse())).toBeCloseTo(approximateArea(shape),4);expect(approximateArea([])).toBe(0);
  });
});
