// 공식 포털의 탐색 안내입니다. 특정 작물의 약제 처방 근거로 취급하지 않습니다.
export const knowledge=[
  {id:'nongsaro',title:'농촌진흥청 농사로 재배·영농 자료',url:'https://www.nongsaro.go.kr/portal/portalMain.ps?menuId=PS00001',keywords:['재배','작물','감자','고추','일지','병','수확','관수'],summary:'작목별 재배 자료와 영농기술 자료를 확인하는 공식 탐색 경로입니다. 지역·품종·재배 시기에 맞는 상세 자료를 추가 확인해야 합니다.',reviewedAt:'2026-10-29',scope:'공식 포털 탐색 안내'},
  {id:'psis',title:'농촌진흥청 농약안전정보시스템',url:'https://psis.rda.go.kr/',keywords:['농약','살충','살균','희석','살포','혼용','방제','비료','시비'],summary:'농약의 해당 작물 등록과 안전사용기준을 공식 시스템에서 확인해야 합니다. 현재 검색 색인은 개별 제품의 등록·희석 배수·사용량을 검증하지 않습니다.',reviewedAt:'2026-10-29',scope:'안전 정보 확인 경로'},
  {id:'rda-data',title:'농업기술 데이터 플랫폼 OpenAPI 안내',url:'https://adp.rda.go.kr/portal/pub/openApi/info.do',keywords:['자료','센서','스마트','데이터','토양','기상'],summary:'공식 농업 데이터 활용 시 출처와 이용허락 범위를 확인하는 안내입니다. 원본 데이터 수집·라이선스 검토 없이 상세 재배 근거로 간주하지 않습니다.',reviewedAt:'2026-10-29',scope:'데이터 이용 안내'}
] as const;
export function searchKnowledge(question:string){const normalized=question.toLowerCase();return [...knowledge].map(source=>({source,score:source.keywords.reduce((sum,word)=>sum+(normalized.includes(word)?1:0),0)})).sort((a,b)=>b.score-a.score).filter((r,index)=>r.score>0||index===0).slice(0,3).map(r=>({...r.source}));}
export function safetyReviewRequired(text:string){return /농약|비료|살충|살균|희석|살포|혼용|시비|질소|제초|pesticid|fertili[sz]|herbicid|insecticid|fungicid|dosage|농.*약|\d+(?:\.\d+)?(?:ml|cc|밀리리터|그램|k?g|배)|\d+[:：]\d+/iu.test(text.normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g,''));}
