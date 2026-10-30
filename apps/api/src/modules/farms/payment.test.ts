import {describe,it,expect,vi,afterEach} from 'vitest';
import {assertPaymentEnabled,tossTestRequest} from './payment.provider';
afterEach(()=>vi.unstubAllEnvs());
const input={paymentId:'test-order-0001',providerKey:'test-payment-key',amountWon:10000,requestKey:'test-idempotency-0001'};
describe('결제 공급자 안전 경계',()=>{
  it('기본 미설정과 서버 환경 시뮬레이터를 차단합니다',()=>{vi.stubEnv('PAYMENT_MODE','DISABLED');expect(assertPaymentEnabled).toThrow();vi.stubEnv('PAYMENT_MODE','SIMULATOR');vi.stubEnv('APP_ENV','PRODUCTION');expect(assertPaymentEnabled).toThrow();});
  it('라이브 키는 네트워크 호출 전에 거부합니다',async()=>{vi.stubEnv('PAYMENT_MODE','TOSS_TEST');vi.stubEnv('TOSS_TEST_SECRET_KEY','live_sk_fixture');const fetcher=vi.fn();await expect(tossTestRequest('CONFIRM',input,fetcher)).rejects.toMatchObject({statusCode:503});expect(fetcher).not.toHaveBeenCalled();});
  it('테스트 승인 금액·주문·키와 멱등성 헤더를 검증합니다',async()=>{vi.stubEnv('PAYMENT_MODE','TOSS_TEST');vi.stubEnv('TOSS_TEST_SECRET_KEY','test_sk_fixture');const fetcher=vi.fn().mockResolvedValue(Response.json({paymentKey:input.providerKey,orderId:input.paymentId,totalAmount:input.amountWon,status:'DONE'}));await tossTestRequest('CONFIRM',input,fetcher);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(input.requestKey);expect(JSON.parse(fetcher.mock.calls[0][1].body).amount).toBe(10000);});
  it('금액 위변조 응답과 장애를 결제 성공으로 처리하지 않습니다',async()=>{vi.stubEnv('PAYMENT_MODE','TOSS_TEST');vi.stubEnv('TOSS_TEST_SECRET_KEY','test_sk_fixture');const fetcher=vi.fn().mockResolvedValue(Response.json({paymentKey:input.providerKey,orderId:input.paymentId,totalAmount:1,status:'DONE'}));await expect(tossTestRequest('CONFIRM',input,fetcher)).rejects.toMatchObject({errorCode:'PAYMENT_STATUS_UNKNOWN'});});
  it('환불도 테스트 공급자의 전액 취소 상태만 인정합니다',async()=>{vi.stubEnv('PAYMENT_MODE','TOSS_TEST');vi.stubEnv('TOSS_TEST_SECRET_KEY','test_sk_fixture');const fetcher=vi.fn().mockResolvedValue(Response.json({paymentKey:input.providerKey,orderId:input.paymentId,totalAmount:input.amountWon,status:'CANCELED'}));await tossTestRequest('REFUND',input,fetcher);expect(JSON.parse(fetcher.mock.calls[0][1].body).cancelAmount).toBe(input.amountWon);});
});
