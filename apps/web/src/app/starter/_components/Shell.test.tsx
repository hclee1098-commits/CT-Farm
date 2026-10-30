import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const fixture=vi.hoisted(()=>({user:{id:'fixture',name:'합성 농민',role:'USER'} as {id:string;name:string;role:string}|null,path:'/starter/diary/manual'}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:()=>{}}),usePathname:()=>fixture.path}));
vi.mock('next/link',()=>({default:({href,children,...props}:any)=><a href={href} {...props}>{children}</a>}));
vi.mock('../_lib/auth',()=>({useAuth:()=>({user:fixture.user,loading:false,logout:async()=>{}})}));
import {StarterShell} from './Shell';
import MorePage from '../more/page';
describe('농민 화면의 서버 렌더링 정보 구조',()=>{
 it('하단·사이드 공통 주 메뉴는 5개이며 알림은 별도 접근',()=>{fixture.user={id:'fixture',name:'합성 농민',role:'USER'};const html=renderToStaticMarkup(<StarterShell><p>내용</p></StarterShell>),nav=html.match(/<nav[^>]*aria-label="주 메뉴"[\s\S]*?<\/nav>/)?.[0]||'';expect((nav.match(/<a /g)||[]).length).toBe(5);expect(nav).not.toContain('/starter/notifications');expect(html).toContain('aria-label="알림 확인"');expect(nav).toContain('href="/starter/diary" aria-current="page"');expect(html).toContain('href="#starter-main"');});
 it('게스트에게 농장 작업 메뉴를 노출하지 않음',()=>{fixture.user=null;const html=renderToStaticMarkup(<StarterShell><p>내용</p></StarterShell>);expect(html).not.toContain('farmer-tabs');expect(html).toContain('/starter/login');expect(html).not.toContain('href="/starter/farms"');});
 it('플랫폼 관리자 메뉴와 농민용 전체 메뉴 분리',()=>{fixture.user={id:'fixture',name:'합성 농민',role:'USER'};expect(renderToStaticMarkup(<MorePage/>)).not.toContain('/starter/admin');fixture.user={...fixture.user,role:'ADMIN'};const html=renderToStaticMarkup(<MorePage/>);expect(html).toContain('/starter/admin');expect(html).toContain('플랫폼 운영');expect(html).toContain('/starter/collaboration');});
});
