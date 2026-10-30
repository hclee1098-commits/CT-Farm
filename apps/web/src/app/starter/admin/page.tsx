"use client";
import { useState } from "react";
import { useAuth } from "../_lib/auth";
type Member = { id: string; email: string; name: string; role: string; suspendedAt: string | null; mfaEnabled: boolean };
export default function AdminPage() {
  const { user, request } = useAuth();
  const [code, setCode] = useState(""); const [search, setSearch] = useState("");
  const [members, setMembers] = useState<Member[]>([]); const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [dashboard, setDashboard] = useState<unknown>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function call(path: string, options: RequestInit = {}) {
    setBusy(true); setMessage("");
    try { return await request(path, { ...options, headers: { "X-MFA-Code": code } }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "요청 실패"); return null; }
    finally { setCode(""); setBusy(false); }
  }
  async function load(target: number) {
    const result = await call(`/admin/users?search=${encodeURIComponent(search)}&page=${target}`) as { items: Member[]; total: number } | null;
    if (result) { setMembers(result.items); setTotal(result.total); setPage(target); }
  }
  if (user?.role !== "ADMIN") return <p role="alert">관리자 계정으로 로그인해 주세요.</p>;
  return <section className="starter-card"><h1>관리자</h1><p>각 조회·변경 요청마다 새로운 6자리 MFA 코드를 입력하세요. 이미 사용한 코드는 다음 시간 구간까지 사용할 수 없습니다.</p>
    <p role="status" aria-live="polite">{message}</p><fieldset disabled={busy}><legend>관리자 재인증</legend>
      <label htmlFor="admin-code">MFA 코드</label><input id="admin-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
      <button onClick={async () => setDashboard(await call("/admin/dashboard"))}>시스템 현황 조회</button>
      {dashboard !== null && <pre style={{ overflowX: "auto" }}>{JSON.stringify(dashboard, null, 2)}</pre>}
      <label htmlFor="admin-search">회원 검색</label><input id="admin-search" type="search" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => load(1)}>검색</button>
      <div style={{ overflowX: "auto" }}><table><caption>회원 목록 · {total}명</caption><thead><tr><th scope="col">회원</th><th scope="col">역할</th><th scope="col">상태</th><th scope="col">작업</th></tr></thead><tbody>{members.map(member => <tr key={member.id}><td>{member.name}<br />{member.email}</td><td>{member.role}</td><td>{member.suspendedAt ? "정지" : "활성"}</td><td><button disabled={member.id === user.id} onClick={async () => { if (await call(`/admin/users/${member.id}`, { method: "PATCH", body: JSON.stringify({ suspended: !member.suspendedAt }) })) setMessage("상태 변경 완료. 새 코드로 목록을 다시 조회하세요."); }}>정지 / 해제</button><button disabled={member.id === user.id || (!member.mfaEnabled && member.role !== "ADMIN")} onClick={async () => { if (await call(`/admin/users/${member.id}`, { method: "PATCH", body: JSON.stringify({ role: member.role === "ADMIN" ? "USER" : "ADMIN" }) })) setMessage("역할 변경 완료. 새 코드로 목록을 다시 조회하세요."); }}>역할 변경</button></td></tr>)}</tbody></table></div>
      <button disabled={page <= 1} onClick={() => load(page - 1)}>이전</button><span>{page} 페이지</span><button disabled={page * 30 >= total} onClick={() => load(page + 1)}>다음</button>
    </fieldset></section>;
}
