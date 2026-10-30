import {describe,it,expect} from 'vitest';
import jwt from 'jsonwebtoken';
import {authScope} from './auth-scope';
describe('환경별 JWT 경계',()=>{
 it('LOCAL의 기존 issuer/audience를 유지합니다',()=>{expect(authScope('LOCAL')).toEqual({issuer:'starter-api',audience:'starter-clients'});});
 it.each(['STAGING','PRODUCTION'] as const)('%s 토큰은 같은 키를 잘못 재사용해도 다른 환경에서 거부합니다',environment=>{
  const key='test-only-key-00000000000000000000000000000';const token=jwt.sign({ver:0},key,{...authScope(environment),expiresIn:'15m',algorithm:'HS256'});
  for(const target of ['LOCAL','STAGING','PRODUCTION'] as const){if(target===environment)expect(()=>jwt.verify(token,key,authScope(target))).not.toThrow();else expect(()=>jwt.verify(token,key,authScope(target))).toThrow();}
 });
});
