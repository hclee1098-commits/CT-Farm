// 빌드된 Next 서버의 실제 응답과 보안 헤더를 임시 포트에서 확인합니다.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: path.join(root, "apps/web"), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
child.stdout.on("data", (data) => { log += data; });
child.stderr.on("data", (data) => { log += data; });
const base = `http://127.0.0.1:${port}`;
try {
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(base + "/starter", { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, `Next 서버 시작 실패: ${log}`);
  const redirect = await fetch(base, { redirect: "manual" });
  assert.equal(redirect.status, 307); assert.equal(redirect.headers.get("location"), "/starter");
  const pages = ["/starter/farms/12345678-1234-4234-8234-123456789012", "/starter/farms", "/starter/email", "/starter", "/starter/login", "/starter/register", "/starter/account", "/starter/admin", "/starter/notifications", "/starter/notes", "/starter/files", "/starter/toolkit", "/starter/toolkit/part8", "/starter/toolkit/part9", "/starter/toolkit/part9/private"];
  for (const page of pages) {
    const response = await fetch(base + page, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, page);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
    console.log(`PASS ${page}: HTTP 200, 보안 헤더 확인`);
  }
  for (const endpoint of ['/dev-portal','/metadata','/events','/monitor','/documents']) {
    assert.equal((await fetch(base + endpoint)).status, 404, `운영 WEB 개발 경로 노출: ${endpoint}`);
  }
  console.log(`프로덕션 웹 HTTP 검증 통과: 루트 리다이렉트, ${pages.length}개 화면, 개발 경로 5개 404`);
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await exited; clearTimeout(timer);
  }
}

