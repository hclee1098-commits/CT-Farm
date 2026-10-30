"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../_lib/auth";
import { getErrorMessage } from "../_lib/api";
import "./farms.css";
import { LocationMap } from './LocationMap';
import { DiaryPhotos } from './DiaryPhotos';

type FarmInput = { name: string; address: string; latitude: number; longitude: number; areaM2: number; crop: string; variety: string; stage: string };
type Farm = FarmInput & { id: string; version: number };
type Entry = { id: string; version: number; workDate: string; title: string; content: string };
type Page<T> = { items: T[]; totalPages: number };
const stages: Record<string, string> = { PREPARING: "재배 준비", SOWING: "파종·정식", GROWING: "생육", HARVESTING: "수확", RESTING: "휴경" };
const emptyFarm: FarmInput = { name: "", address: "", latitude: 37, longitude: 127, areaM2: 100, crop: "", variety: "", stage: "PREPARING" };
const emptyDiary = { workDate: new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), title: "", content: "" };

export default function FarmsPage() {
  const { user, loading, request } = useAuth();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [form, setForm] = useState(emptyFarm);
  const [editing, setEditing] = useState<Farm | null>(null);
  const [selected, setSelected] = useState<Farm | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [archivedFarms,setArchivedFarms]=useState<Farm[]>([]);
  const [archivedEntries,setArchivedEntries]=useState<Entry[]>([]);
  const [diaryPage, setDiaryPage] = useState(1);
  const [diaryPages, setDiaryPages] = useState(1);
  const [diary, setDiary] = useState(emptyDiary);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm,setShowForm]=useState(false);
  const load = useCallback(async () => {
    const result = await request<Page<Farm>>(`/farms?page=${page}`);
    setFarms(result.items); setPages(result.totalPages);
  }, [request, page]);
  const loadDiary = useCallback(async () => {
    if (!selected) return;
    const result = await request<Page<Entry>>(`/farms/${selected.id}/diary?page=${diaryPage}`);
    setEntries(result.items); setDiaryPages(result.totalPages);
  }, [request, selected, diaryPage]);
  useEffect(() => {
    if (!user) { setFarms([]); setSelected(null); setEntries([]); return; }
    let active = true;
    setFetching(true);
    // 페이지 이동 이후 도착한 이전 응답이 화면을 덮어쓰지 않습니다.
    request<Page<Farm>>(`/farms?page=${page}`).then(result => {
      if (active) { setFarms(result.items); setPages(result.totalPages); }
    }).catch(e => { if (active) setError(getErrorMessage(e)); }).finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [user, page, request]);
  useEffect(() => {
    if (!user || !selected) return;
    let active = true;
    setEntries([]);
    request<Page<Entry>>(`/farms/${selected.id}/diary?page=${diaryPage}`).then(result => {
      if (active) { setEntries(result.items); setDiaryPages(result.totalPages); }
    }).catch(e => { if (active) setError(getErrorMessage(e)); });
    return () => { active = false; };
  }, [user, selected, diaryPage, request]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  }
  function saveFarm(e: FormEvent) {
    e.preventDefault();
    void perform(async () => {
      await request(editing ? `/farms/${editing.id}` : "/farms", { method: editing ? "PUT" : "POST", body: JSON.stringify({ ...form, ...(editing ? { version: editing.version } : {}) }) });
      setEditing(null); setForm(emptyFarm); setSelected(null); await load(); setMessage("농장을 저장했습니다.");
    });
  }
  function saveDiary(e: FormEvent) {
    e.preventDefault(); if (!selected) return;
    void perform(async () => {
      await request(`/farms/${selected.id}/diary${editingEntry ? `/${editingEntry.id}` : ""}`, { method: editingEntry ? "PUT" : "POST", body: JSON.stringify({ ...diary, ...(editingEntry ? { version: editingEntry.version } : {}) }) });
      setDiary(emptyDiary); setEditingEntry(null); await loadDiary(); setMessage("영농일지를 저장했습니다.");
    });
  }
  if (loading) return <p role="status">로그인 상태를 확인하고 있습니다.</p>;
  if (!user) return <section><h1>내 농장</h1><p>농장 정보를 안전하게 관리하려면 로그인해 주세요.</p><Link href="/starter/login">로그인</Link></section>;
  return <div className="starter-container farm-workspace">
    <div className="ct-page-heading"><div><p className="ct-eyebrow">나의 농사 공간</p><h1>내 농장</h1><p>농장을 골라 작물과 기록을 확인하세요.</p></div><button className="starter-button" onClick={()=>setShowForm(!showForm)} aria-expanded={showForm}>{showForm?'등록 화면 닫기':'새 농장 등록'}</button></div>
    {error && <p role="alert" className="starter-alert error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {(showForm||editing)&&<section className="starter-card"><h2>{editing ? "농장 정보 수정" : "새 농장 등록"}</h2>
      <form onSubmit={saveFarm}><fieldset disabled={busy} className="farm-fields">
        {([['name', '농장 이름', 100], ['address', '주소', 300], ['crop', '작물', 80], ['variety', '품종 (선택)', 80]] as const).map(([key, label, max]) => <label key={key}>{label}<input required={key !== 'variety'} maxLength={max} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}
        {([['latitude', '위도', -90, 90], ['longitude', '경도', -180, 180], ['areaM2', '면적 (㎡)', 0.01, 1000000000]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" step="any" min={min} max={max} required value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.valueAsNumber })}/></label>)}
        <label>생육 단계<select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>{Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="starter-button" type="submit">{busy ? "처리 중…" : "농장 저장"}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyFarm); }}>수정 취소</button>}
      </fieldset></form>
      <LocationMap latitude={form.latitude} longitude={form.longitude} onPick={(latitude,longitude)=>setForm({...form,latitude,longitude})}/>
      <p>네이버 지도는 서버의 공개 Key ID와 도메인 설정 후 켤 수 있습니다. 팜맵은 필지 관리에서 내려받은 경계 좌표를 변환해 가져올 수 있습니다.</p>
    </section>}
    <section className="starter-card"><h2>등록한 농장</h2>
      <button disabled={busy} onClick={()=>void perform(async()=>{setArchivedFarms(await request<Farm[]>('/farms/archived'));setMessage('최근 보관 농장 100건까지 불러왔습니다.');})}>보관한 농장 조회·복구</button>
      {archivedFarms.map(farm=><div key={farm.id}><span>{farm.name} (보관됨)</span><button disabled={busy} onClick={()=>void perform(async()=>{await request(`/farms/${farm.id}/restore`,{method:'POST',body:JSON.stringify({version:farm.version})});setArchivedFarms(archivedFarms.filter(f=>f.id!==farm.id));await load();setMessage('농장을 복구했습니다.');})}>농장 복구</button></div>)}
      {fetching ? <p role="status">농장 목록을 불러오고 있습니다.</p> : farms.length === 0 ? <p>등록한 농장이 없습니다.</p> : farms.map(farm => <article key={farm.id} className="farm-item">
        <h3>{farm.name}</h3><p>{farm.address}</p><p>{farm.crop} {farm.variety} · {stages[farm.stage]} · {farm.areaM2.toLocaleString('ko-KR')}㎡</p>
        <div className="starter-actions"><button disabled={busy} onClick={() => { setSelected(farm); setDiaryPage(1); setDiary(emptyDiary); setEditingEntry(null); setArchivedEntries([]); }}>영농일지 열기</button>
        <Link href={`/starter/farms/${farm.id}`}>필지·작물·일정·센서·경영 관리</Link>
        <button disabled={busy} onClick={() => { setEditing(farm); setForm({ name: farm.name, address: farm.address, crop: farm.crop, variety: farm.variety, stage: farm.stage, latitude: farm.latitude, longitude: farm.longitude, areaM2: farm.areaM2 }); }}>농장 수정</button>
        <button disabled={busy} onClick={() => {
          if (!window.confirm(`${farm.name} 농장을 목록에서 보관 처리할까요? 원본 데이터와 일지는 보존됩니다.`)) return;
          void perform(async () => { await request(`/farms/${farm.id}`, { method: "DELETE", body: JSON.stringify({ version: farm.version }) }); setSelected(null); setEditing(null); setForm(emptyFarm); await load(); setMessage("농장을 보관했습니다."); });
        }}>농장 보관</button></div>
      </article>)}
      <div className="starter-actions"><button disabled={busy || fetching || page === 1} onClick={() => setPage(page - 1)}>이전 농장</button><span>{page} / {pages}</span><button disabled={busy || fetching || page >= pages} onClick={() => setPage(page + 1)}>다음 농장</button></div>
    </section>
    {selected && <section className="starter-card"><h2>{selected.name} 영농일지</h2>
      <button disabled={busy} onClick={()=>void perform(async()=>{setArchivedEntries(await request<Entry[]>(`/farms/${selected.id}/diary/archived`));setMessage('최근 삭제 일지 100건까지 불러왔습니다.');})}>삭제한 일지 조회·복구</button>
      {archivedEntries.map(entry=><div key={entry.id}><span>{entry.workDate} · {entry.title}</span><button disabled={busy} onClick={()=>void perform(async()=>{await request(`/farms/${selected.id}/diary/${entry.id}/restore`,{method:'POST',body:JSON.stringify({version:entry.version})});setArchivedEntries(archivedEntries.filter(e=>e.id!==entry.id));await loadDiary();setMessage('일지를 복구했습니다.');})}>일지 복구</button></div>)}
      <form onSubmit={saveDiary}><fieldset disabled={busy} className="farm-fields">
        <label>작업 날짜<input type="date" required value={diary.workDate} onChange={e => setDiary({ ...diary, workDate: e.target.value })}/></label>
        <label>작업 제목<input required maxLength={120} value={diary.title} onChange={e => setDiary({ ...diary, title: e.target.value })}/></label>
        <label className="farm-wide">작업 내용<textarea required rows={5} maxLength={5000} value={diary.content} onChange={e => setDiary({ ...diary, content: e.target.value })}/></label>
        <button type="submit" className="starter-button">{editingEntry ? "일지 수정 저장" : "일지 등록"}</button>
        {editingEntry && <button type="button" onClick={() => { setEditingEntry(null); setDiary(emptyDiary); }}>수정 취소</button>}
      </fieldset></form>
      {entries.map(entry => <article key={entry.id} className="farm-item"><h3>{entry.workDate} · {entry.title}</h3><p className="farm-content">{entry.content}</p>
        <DiaryPhotos farmId={selected.id} diaryId={entry.id}/>
        <button disabled={busy} onClick={() => { setEditingEntry(entry); setDiary({ workDate: entry.workDate, title: entry.title, content: entry.content }); }}>일지 수정</button>
        <button disabled={busy} onClick={() => {
          if (!window.confirm("이 일지를 목록에서 삭제할까요? 원본은 보존됩니다.")) return;
          void perform(async () => { await request(`/farms/${selected.id}/diary/${entry.id}`, { method: "DELETE", body: JSON.stringify({ version: entry.version }) }); setEditingEntry(null); setDiary(emptyDiary); await loadDiary(); setMessage("일지를 삭제했습니다."); });
        }}>일지 삭제</button>
      </article>)}
      <div className="starter-actions"><button disabled={busy || diaryPage === 1} onClick={() => setDiaryPage(diaryPage - 1)}>이전 일지</button><span>{diaryPage} / {diaryPages}</span><button disabled={busy || diaryPage >= diaryPages} onClick={() => setDiaryPage(diaryPage + 1)}>다음 일지</button></div>
    </section>}
  </div>;
}
