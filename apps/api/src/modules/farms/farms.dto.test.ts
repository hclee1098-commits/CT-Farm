import { describe, expect, it } from 'vitest';
import { diaryInput, farmInput, listQuery, versionInput } from './farms.dto';
describe('농장 입력 경계', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-2-01', 'not-a-date'])('유효하지 않은 작업일 %s 차단', workDate => {
    expect(diaryInput.safeParse({ workDate, title: '관수', content: '20분' }).success).toBe(false);
  });
  it('윤년 작업일을 허용합니다', () => {
    expect(diaryInput.safeParse({ workDate: '2028-02-29', title: '관수', content: '20분' }).success).toBe(true);
  });
  it('숫자 문자열과 소유자 주입을 거부합니다', () => {
    const input = { name: '밭', address: '주소', latitude: 37, longitude: 127, areaM2: 10, crop: '감자', stage: 'GROWING' };
    expect(farmInput.safeParse(input).success).toBe(true);
    expect(farmInput.safeParse({ ...input, ownerId: 'someone' }).success).toBe(false);
    expect(farmInput.safeParse({ ...input, areaM2: '10' }).success).toBe(false);
  });
  it('무제한 목록 조회를 차단합니다', () => {
    expect(listQuery.safeParse({ page: 0 }).success).toBe(false);
    expect(listQuery.safeParse({ page: 100001 }).success).toBe(false);
  });
  it('DB 정수 범위를 넘는 버전을 거부합니다', () => {
    expect(versionInput.safeParse({ version: 2147483647 }).success).toBe(false);
  });
});
