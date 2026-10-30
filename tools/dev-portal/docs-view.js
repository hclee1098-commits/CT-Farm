// 로컬 번들만 사용. Markdown HTML은 정화하고 모든 내부 경로를 허용 목록과 비교합니다.
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',flowchart:{htmlLabels:false},maxTextSize:100000});
export function resolveLink(current,href){
 if(!href||/^[a-z][a-z0-9+.-]*:/i.test(href)||href.startsWith('//'))return null;
 try{const u=new URL(href,'https://docs.invalid/'+current);if(u.origin!=='https://docs.invalid')return null;return {path:decodeURIComponent(u.pathname.slice(1)),hash:decodeURIComponent(u.hash.slice(1))};}catch{return null;}
}
export function searchDocuments(docs,query){const q=query.trim().toLocaleLowerCase();return docs.filter(d=>(d.title+' '+d.path+' '+d.text).toLocaleLowerCase().includes(q));}
export function headings(text){let fence=false;const used=new Map();return text.split('\n').flatMap(line=>{if(line.startsWith('```')){fence=!fence;return [];}const m=!fence&&line.match(/^(#{1,6})\s+(.+)$/);if(!m)return [];const title=m[2].trim();const base=title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-');const n=used.get(base)||0;used.set(base,n+1);return [{level:m[1].length,title,id:base+(n?'-'+n:'')}];});}
export async function renderMarkdown(article,text){
 article.innerHTML=DOMPurify.sanitize(marked.parse(text),{FORBID_TAGS:['style','iframe','form','input'],FORBID_ATTR:['style'],ALLOW_DATA_ATTR:false});
 // 이미지와 외부 연결은 문서에 있어도 자동 요청하지 않습니다.
 article.querySelectorAll('img').forEach(img=>img.replaceWith(document.createTextNode(img.alt||'[이미지]')));
 const hs=headings(text);article.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h,i)=>{h.id=hs[i]?.id||'section-'+i;});
 for(const code of article.querySelectorAll('pre > code.language-mermaid')){
  const source=code.textContent,box=document.createElement('div');box.className='mermaid-diagram';
  try{await mermaid.parse(source);const {svg}=await mermaid.render('diagram-'+crypto.randomUUID(),source);box.innerHTML=DOMPurify.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true}});code.parentElement.replaceWith(box);}catch{code.parentElement.before(document.createTextNode('다이어그램 표시 실패: 아래 원문을 확인하세요.'));}
 }
 return hs;
}
let docsCache,selected='docs/README.md',revision=0;
export function selectDocument(path){selected=path;}
export async function showDocs({container,query,token,source,isCurrent=()=>true}){
 const rev=++revision;container.classList.add('document-center');
 if(!docsCache){const res=await fetch('/documents',{headers:{Authorization:'Bearer '+token}});if(!res.ok)throw Error('문서 접근 거부 또는 키 만료');docsCache=await res.json();}
 if(rev!==revision||!container.isConnected||!isCurrent())return;
 const docs=searchDocuments(docsCache,query),nav=document.createElement('details'),summary=document.createElement('summary');nav.className='docs-nav';nav.open=matchMedia('(min-width: 900px)').matches;summary.textContent=`문서 카테고리 · ${docs.length}건`;nav.append(summary);
 const toc=document.createElement('details'),ts=document.createElement('summary');toc.className='docs-toc';toc.open=nav.open;ts.textContent='이 문서의 목차';toc.append(ts);
 const article=document.createElement('article');article.className='docs-article';article.setAttribute('aria-label','선택한 문서');
 const groups=new Map();for(const doc of docs){const category=doc.path.split('/')[1]||'문서센터';if(!groups.has(category)){const group=document.createElement('div'),h=document.createElement('h3');h.textContent=category==='README.md'?'시작 페이지':category;group.append(h);groups.set(category,group);nav.append(group);}const b=document.createElement('button');b.className='row';b.textContent=doc.title;b.setAttribute('aria-current',String(doc.path===selected));b.title=doc.description;const brief=document.createElement('small');brief.textContent=doc.description;b.append(brief);b.onclick=()=>{selected=doc.path;showDocs({container,query,token,source,isCurrent});};groups.get(category).append(b);}
 container.replaceChildren(nav,article,toc);
 const doc=docsCache.find(d=>d.path===selected)||docsCache[0];if(!docs.length){article.textContent='검색 결과가 없습니다.';return;}if(query&&!docs.some(d=>d.path===selected)){selected=docs[0].path;return showDocs({container,query,token,source,isCurrent});}
 const hs=await renderMarkdown(article,doc.text);if(rev!==revision||!isCurrent())return;
 const meta=document.createElement('p');meta.className='doc-path';meta.textContent=doc.path+' · '+(doc.status||'참고 문서')+(doc.modified?' · 최종 수정 '+new Date(doc.modified).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'');article.prepend(meta);
 for(const h of hs){const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.title;a.style.paddingLeft=(h.level-1)*10+'px';a.onclick=e=>{e.preventDefault();article.querySelectorAll('[id]').forEach(el=>{if(el.id===h.id)el.scrollIntoView({block:'start'});});};toc.append(a);}
 article.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href');a.onclick=e=>{e.preventDefault();const target=resolveLink(doc.path,href);if(!target){a.title='외부 링크는 문서 원본에서 확인하세요.';return;}if(target.path===doc.path&&target.hash){article.querySelectorAll('[id]').forEach(el=>{if(el.id===target.hash)el.scrollIntoView({block:'start'});});return;}if(docsCache.some(d=>d.path===target.path)){selected=target.path;showDocs({container,query:'',token,source,isCurrent}).then(()=>{if(target.hash)container.querySelectorAll('[id]').forEach(el=>{if(el.id===target.hash)el.scrollIntoView();});});}else source(target.path);};});
}
