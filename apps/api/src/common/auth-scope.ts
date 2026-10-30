// LOCAL의 기존 토큰 형식을 유지하고 원격 환경 간 토큰 수용을 분리합니다.
export function authScope(environment: 'LOCAL'|'STAGING'|'PRODUCTION') {
 const suffix=environment==='LOCAL'?'':`-${environment.toLowerCase()}`;
 return {issuer:`starter-api${suffix}`,audience:`starter-clients${suffix}`};
}
