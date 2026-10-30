import {afterEach,describe,expect,it,vi} from 'vitest';
import {startFarmAssistant} from './assistant.worker';
import {prisma} from '../../infrastructure/prisma';
import {notifyAdvice} from './operations.service';
vi.mock('../../infrastructure/prisma',()=>({prisma:{farm:{findMany:vi.fn()}}}));
vi.mock('./operations.service',()=>({notifyAdvice:vi.fn()}));
vi.mock('../../infrastructure/logger',()=>({logger:{warn:vi.fn()}}));
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
describe('능동 점검 작업자',()=>{
  it('기본 비활성 상태에서는 DB를 읽지 않습니다',()=>{
    vi.stubEnv('FARM_ASSISTANT_ENABLED','false');const stop=startFarmAssistant();stop();expect(prisma.farm.findMany).not.toHaveBeenCalled();
  });
  it('농장별 실패를 격리하고 다음 농장을 계속 점검합니다',async()=>{
    vi.stubEnv('FARM_ASSISTANT_ENABLED','true');
    vi.mocked(prisma.farm.findMany).mockResolvedValueOnce([{id:'a',ownerId:'u'},{id:'b',ownerId:'u'}] as never).mockResolvedValueOnce([]);
    vi.mocked(notifyAdvice).mockRejectedValueOnce(new Error('fixture failure')).mockResolvedValueOnce({created:1} as never);
    const stop=startFarmAssistant();
    try{await vi.waitFor(()=>expect(notifyAdvice).toHaveBeenCalledTimes(2));expect(notifyAdvice).toHaveBeenNthCalledWith(2,'u','b');}finally{stop();}
  });
});
