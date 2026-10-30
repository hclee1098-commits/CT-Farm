"use client";
import "../../../shared/ui/ui.css";
import { Notice } from "../../../shared/ui";
import { useState } from "react";
import { useAuth } from "../_lib/auth";

type Session = { id: string; createdAt: string; expiresAt: string };
export default function AccountPage() {
  const { user, request, logoutAll } = useAuth();
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "요청 실패"); }
    finally { setBusy(false); setPassword(""); setMfaCode(""); }
  }
  if (!user) return <p role="status">로그인 후 계정 보안을 관리할 수 있습니다.</p>;
  return <section className="starter-card">
    <h1>계정 보안</h1><p>{user.email} · MFA {user.mfaEnabled ? "사용 중" : "미등록"}</p>
    <Notice>{message}</Notice>
    <fieldset disabled={busy}><legend>민감한 작업 재인증</legend>
      <label htmlFor="account-password">현재 비밀번호</label><input id="account-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      <label htmlFor="account-code">MFA 코드</label><input id="account-code" autoComplete="one-time-code" maxLength={32} value={mfaCode} onChange={e => setMfaCode(e.target.value)} />
      <button className="starter-button" onClick={() => run(async () => setSetup(await request("/account/mfa/setup", { method: "POST", body: JSON.stringify({ password, mfaCode: mfaCode || undefined }) })))}>MFA 등록 시작</button>
      {setup && <div><p>인증 앱에 이 비밀키를 직접 등록하세요. 다른 사람에게 공유하지 마세요.</p><code style={{ overflowWrap: "anywhere" }}>{setup.secret}</code>
        <button className="starter-button" onClick={() => run(async () => {
          const result = await request<{ recoveryCodes: string[] }>("/account/mfa/enable", { method: "POST", body: JSON.stringify({ code: mfaCode }) });
          setCodes(result.recoveryCodes); setSetup(null); setMessage("MFA 등록 완료. 복구 코드를 보관한 후 다시 로그인하세요.");
        })}>입력한 코드로 등록 완료</button></div>}
      {codes.length > 0 && <div><p>복구 코드는 지금 한 번만 표시됩니다. 안전한 곳에 보관하세요.</p><pre>{codes.join("\n")}</pre><button onClick={() => setCodes([])}>표시 닫기</button></div>}
      <button className="starter-button secondary" onClick={() => run(async () => { await request("/account/mfa/disable", { method: "POST", body: JSON.stringify({ password, mfaCode }) }); setMessage("MFA 해제 완료. 다시 로그인하세요."); })}>MFA 해제</button>
      <h2>비밀번호 변경</h2><label htmlFor="new-password">새 비밀번호 (12자 이상, UTF-8 72바이트 이하)</label>
      <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
      <button className="starter-button" onClick={() => run(async () => { await request("/account/password/change", { method: "POST", body: JSON.stringify({ password, newPassword, mfaCode: mfaCode || undefined }) }); setNewPassword(""); setMessage("비밀번호 변경 완료. 다시 로그인하세요."); })}>비밀번호 변경</button>
      <h2>활성 세션</h2><button onClick={() => run(async () => setSessions(await request("/account/sessions")))}>세션 조회</button>
      <ul>{sessions.map(session => <li key={session.id}>{new Date(session.createdAt).toLocaleString()} <button onClick={() => run(async () => { await request(`/account/sessions/${session.id}`, { method: "DELETE" }); setSessions(sessions.filter(item => item.id !== session.id)); })}>이 세션 로그아웃</button></li>)}</ul>
      <button onClick={() => run(async () => { await logoutAll(); setMessage("전체 세션을 종료했습니다."); })}>전체 기기 로그아웃</button>
    </fieldset>
  </section>;
}
