import {renderMarkdown,headings,resolveLink,searchDocuments} from '../dev-portal/docs-view.js';
const docs=CT_FARM_DOCUMENTS;
const $=s=>document.querySelector(s);let selected=docs[0].path,revision=0;
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
const encoded=()=>new URLSearchParams(location.hash.slice(1)).get('doc');
if(docs.some(d=>d.path===encoded()))selected=encoded();
function openDoc(path,anchor){selected=path;$('#search').value='';history.pushState(null,'','#'+new URLSearchParams({doc:path}));draw(anchor).then(()=>{if(!anchor)$('#article').scrollIntoView({block:'start'});});}
async function draw(anchor){
 const rev=++revision,query=$('#search').value,results=searchDocuments(docs,query);$('#result').textContent=`${docs.length}개 문서 중 ${results.length}개 · 제목과 본문 검색`;
 if(query&&results.length&&!results.some(d=>d.path===selected))selected=results[0].path;
 const list=$('#list');list.replaceChildren();const groups=new Map();
 for(const doc of results){if(!groups.has(doc.category)){const group=el('section','');group.append(el('h2',doc.category));groups.set(doc.category,group);list.append(group);}const b=el('button',doc.title);b.type='button';b.setAttribute('aria-current',doc.path===selected?'page':'false');b.onclick=()=>openDoc(doc.path);groups.get(doc.category).append(b);}
 const article=$('#article');$('#headings').replaceChildren();$('#related').replaceChildren();
 if(!results.length){article.replaceChildren(el('h2','검색 결과가 없습니다'),el('p','검색어를 줄이거나 다른 낱말을 입력해 주세요.'));return;}
 const doc=docs.find(d=>d.path===selected)||results[0];
 // 이전 비동기 Mermaid 렌더링이 현재 문서를 덮어쓰지 못하도록 분리합니다.
 const body=el('div','');await renderMarkdown(body,doc.text);if(rev!==revision)return;
 const meta=el('div',`${doc.category} · ${doc.status}`);meta.className='badge';const time=el('p','최종 수정: '+new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(doc.modified))+' (한국 시간)');time.className='meta';
 article.replaceChildren(meta,time,body);
 for(const h of headings(doc.text)){const a=el('a',h.title);a.href='#'+h.id;a.className='level-'+h.level;a.onclick=e=>{e.preventDefault();document.getElementById(h.id)?.scrollIntoView({block:'start'});};$('#headings').append(a);}
 $('#related').append(el('h2','관련 문서'));for(const d of docs.filter(d=>d.path!==doc.path&&(d.category===doc.category||d.path.endsWith('/시작.md')))){const b=el('button',d.title);b.onclick=()=>openDoc(d.path);$('#related').append(b);}
 body.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href'),target=resolveLink(doc.path,href);if(!target){if(/^https:\/\//i.test(href)){a.target='_blank';a.rel='noopener noreferrer';}return;}
 if(target.path==='docs/README.md')target.path=docs[0].path;
 if(docs.some(d=>d.path===target.path))a.href='./index.html#'+new URLSearchParams({doc:target.path});else if(target.path!==doc.path)a.href='#source-reference';
 a.onclick=e=>{e.preventDefault();if(target.path===doc.path&&target.hash){document.getElementById(target.hash)?.scrollIntoView({block:'start'});return;}if(docs.some(d=>d.path===target.path))openDoc(target.path,target.hash);else{const note=el('p',`프로젝트 원본에서 확인: ${target.path} · 내부 상세 문서는 접근키 보호 개발자 포털에서 열 수 있습니다.`);note.className='source-note';a.after(note);a.onclick=e=>e.preventDefault();}};});
 if(anchor)document.getElementById(anchor)?.scrollIntoView({block:'start'});
}
$('#search').addEventListener('input',()=>draw());
addEventListener('hashchange',()=>{if(docs.some(d=>d.path===encoded())){selected=encoded();draw();}});
addEventListener('popstate',()=>{selected=docs.some(d=>d.path===encoded())?encoded():docs[0].path;$('#search').value='';draw();});
if(matchMedia('(min-width:1100px)').matches)$('#toc').open=true;
if(matchMedia('(max-width:760px)').matches)$('#nav').open=false;
draw();
