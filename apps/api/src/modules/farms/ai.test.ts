import {describe,it,expect,vi,afterEach} from 'vitest';
import {searchKnowledge,safetyReviewRequired} from './knowledge';
import {requestAgricultureAnswer} from './ai.provider';
afterEach(()=>vi.unstubAllEnvs());
describe('AI 근거·오류·안전 경계',()=>{
  it('농약·비료 질문을 보수적으로 검토 대상으로 분리합니다',()=>{
    expect(safetyReviewRequired('농약 희석 배수는?')).toBe(true);expect(safetyReviewRequired('fertilizer dosage')).toBe(true);expect(safetyReviewRequired('농\u200B약 사용')).toBe(true);expect(safetyReviewRequired('비 료 20 g')).toBe(true);expect(safetyReviewRequired('용액 1 : 100')).toBe(true);expect(safetyReviewRequired('일지 기록을 정리해 줘')).toBe(false);
  });
  it('검색 결과는 승인된 공식 출처만 반환합니다',()=>{
    expect(searchKnowledge('농약 살포')[0]?.id).toBe('psis');expect(searchKnowledge('일지 정리')[0]?.url).toContain('nongsaro.go.kr');
  });
  it('서버 키가 없으면 외부 호출을 하지 않습니다',async()=>{
    vi.stubEnv('AI_MODE','REFERENCE');const fetcher=vi.fn();await expect(requestAgricultureAnswer({},['nongsaro'],fetcher)).rejects.toMatchObject({statusCode:503});expect(fetcher).not.toHaveBeenCalled();
  });
  it('구조화 응답·출처를 검증하고 store:false로 전송합니다',async()=>{
    vi.stubEnv('AI_MODE','OPENAI');vi.stubEnv('AI_API_KEY','fixture-key-not-a-real-key');vi.stubEnv('AI_MODEL','configured-test-model');
    const fetcher=vi.fn().mockResolvedValue(Response.json({status:'completed',usage:{total_tokens:123},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'기록을 확인해 주세요.',sourceIds:['nongsaro'],uncertainty:'현장 확인이 필요합니다.',needsReview:false})}]}]}));
    const result=await requestAgricultureAnswer({question:'일지 정리'},['nongsaro'],fetcher);expect(result.usageTokens).toBe(123);const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.store).toBe(false);expect(body.text.format.strict).toBe(true);
  });
  it('가짜 출처·잘못된 응답·공급자 오류의 원문을 노출하지 않습니다',async()=>{
    vi.stubEnv('AI_MODE','OPENAI');vi.stubEnv('AI_API_KEY','fixture-key-not-a-real-key');vi.stubEnv('AI_MODEL','configured-test-model');
    const fetcher=vi.fn().mockResolvedValue(Response.json({status:'completed',usage:{total_tokens:1},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'자료',sourceIds:['untrusted'],uncertainty:'불확실',needsReview:false})}]}]}));
    await expect(requestAgricultureAnswer({},['nongsaro'],fetcher)).rejects.toMatchObject({statusCode:502,errorCode:'AI_PROVIDER_ERROR'});
  });
});
