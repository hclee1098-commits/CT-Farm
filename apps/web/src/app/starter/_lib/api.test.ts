import {describe,it,expect} from 'vitest';
import {getErrorMessage} from './api';
describe('현장 입력 오류 안내',()=>{
 it('실제 브라우저 네트워크 오류를 쉬운 한국어로 표시한다',()=>{expect(getErrorMessage(new TypeError('Failed to fetch'))).toContain('서버에 연결하지 못했습니다');});
 it('서버가 제공한 한국어 권한·충돌 설명은 유지한다',()=>{expect(getErrorMessage(new Error('자료가 변경되었습니다.'))).toBe('자료가 변경되었습니다.');});
});
