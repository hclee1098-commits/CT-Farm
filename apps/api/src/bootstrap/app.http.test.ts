import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// HTTP 경계는 실제 Express 서버로 검사하고 외부 DB/Redis만 대체합니다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import jwt from "jsonwebtoken";
import { app } from "./app";
import { prisma } from "../infrastructure/prisma";
import { redis } from "../infrastructure/redis";
import { logger } from "../infrastructure/logger";
import { env } from "../config/env";
vi.mock("../infrastructure/prisma", () => ({ prisma: {
  user: { findUnique: vi.fn() }, note: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() }, $queryRaw: vi.fn()
} }));
vi.mock("../infrastructure/redis", () => ({ redis: { ping: vi.fn(), sendCommand: vi.fn() }, connectRedis: vi.fn() }));
vi.mock("../infrastructure/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("rate-limit-redis", async () => {
  const { MemoryStore } = await import("express-rate-limit");
  return { RedisStore: class extends MemoryStore {} };
});
const telemetryDir=fs.mkdtempSync(path.join(os.tmpdir(),"secure-api-telemetry-"));
let server: Server;
let base: string;
const userId = "12345678-1234-4234-8234-123456789012";
const noteId = "12345678-1234-4234-8234-123456789013";
function token(payload: object = { ver: 0 }, expiresIn: boolean = true) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256", subject: userId, issuer: "starter-api", audience: "starter-clients",
    ...(expiresIn ? { expiresIn: "15m" } : {})
  });
}
async function call(path: string, options: RequestInit = {}) {
  return fetch(base + path, options);
}
beforeAll(async () => {
  vi.stubEnv("MONITOR_DIR",telemetryDir);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await new Promise(r=>setTimeout(r,100));
  vi.unstubAllEnvs();fs.rmSync(telemetryDir,{recursive:true,force:true});
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId, tokenVersion: 0 } as never);
  vi.mocked(prisma.note.findFirst).mockResolvedValue(null);
});
describe("실제 HTTP 보안 경계", () => {
  it("liveness는 DB/Redis 장애와 무관하게 응답하고 요청 ID를 새로 생성합니다", async () => {
    const res = await call("/health/live", { headers: { "X-Request-ID": "attacker-request" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).not.toBe("attacker-request");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(redis.ping).not.toHaveBeenCalled();
  });
  it("허용되지 않은 출처를 차단합니다", async () => {
    expect((await call("/api/v1/notes", { headers: { Origin: "https://evil.test" } })).status).toBe(403);
  });
  it("인증 응답과 오류 응답을 캐시하지 않습니다", async () => {
    const res = await call("/api/v1/notes");
    expect(res.status).toBe(401); expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("웹 인증 POST는 Origin을 요구합니다", async () => {
    const res = await call("/api/v1/auth/web/login", { method: "POST" });
    expect(res.status).toBe(403); expect((await res.json()).errorCode).toBe("INVALID_ORIGIN");
  });
  it.each([{ ver: 0.5 }, { ver: -1 }, { ver: "0" }])("잘못된 토큰 버전은 DB 조회 전에 차단합니다", async (payload) => {
    const res = await call("/api/v1/notes", { headers: { Authorization: `Bearer ${token(payload)}` } });
    expect(res.status).toBe(401); expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("만료 기한이 없는 서명 토큰도 거부합니다", async () => {
    const res = await call("/api/v1/notes", { headers: { Authorization: `Bearer ${token({ ver: 0 }, false)}` } });
    expect(res.status).toBe(401); expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("전체 로그아웃 이전 토큰을 거부합니다", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId, tokenVersion: 1 } as never);
    const res = await call("/api/v1/notes", { headers: { Authorization: `Bearer ${token()}` } });
    expect(res.status).toBe(401); expect((await res.json()).errorCode).toBe("SESSION_REVOKED");
  });
  it("다른 사용자의 게시글은 404로 처리하고 소유자 조건을 전달합니다", async () => {
    const res = await call(`/api/v1/notes/${noteId}`, { headers: { Authorization: `Bearer ${token()}` } });
    expect(res.status).toBe(404);
    expect(prisma.note.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: noteId, ownerId: userId, deletedAt: null } }));
  });
  it("잘못된 JSON은 400으로 처리합니다", async () => {
    const res = await call("/api/v1/auth/mobile/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect(res.status).toBe(400); expect((await res.json()).errorCode).toBe("INVALID_JSON");
  });
  it("1MiB 초과 JSON은 413으로 처리합니다", async () => {
    const res = await call("/api/v1/auth/mobile/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "a".repeat(1024 * 1024) }) });
    expect(res.status).toBe(413);
  });
  it("예외의 비밀값을 응답과 전역 오류 로그에 남기지 않습니다", async () => {
    const secret = "database-password-never-log-this";
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error(secret));
    const res = await call("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token()}` } });
    expect(res.status).toBe(500); expect(await res.text()).not.toContain(secret);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(secret);
  });
  it("DB/Redis 장애는 readiness 503으로 처리합니다", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("unavailable"));
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error("unavailable"));
    expect((await call("/health/ready")).status).toBe(503);
  });
  it("알 수 없는 API 경로도 JSON 오류로 응답합니다", async () => {
    const res = await call("/api/v1/missing"); expect(res.status).toBe(404);
    expect((await res.json()).errorCode).toBe("ROUTE_NOT_FOUND");
  });
});


describe("V6 접근 통제", () => {
  it("관리자 API의 미인증 접근을 거부합니다", async () => {
    expect((await call("/api/v1/admin/dashboard")).status).toBe(401);
  });
  it("일반 사용자는 관리자 API에 접근할 수 없습니다", async () => {
    const res = await call("/api/v1/admin/dashboard", { headers: { Authorization: `Bearer ${token()}` } });
    expect(res.status).toBe(403); expect((await res.json()).errorCode).toBe("ADMIN_REQUIRED");
  });
  it.each(["suspendedAt", "deletedAt"])("정지 및 탈퇴 계정의 기존 토큰을 거부합니다: %s", async field => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId, tokenVersion: 0, [field]: new Date() } as never);
    expect((await call("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token()}` } })).status).toBe(401);
  });
});

it("개발 포털 경로를 API 애플리케이션이 제공하지 않습니다", async () => {
  for (const path of ["/metadata", "/events", "/monitor", "/documents", "/dev-portal"]) expect((await call(path)).status).toBe(404);
});

it("실제 HTTP 요청의 정상·오류·보안 이벤트를 비밀정보 없이 파일로 수집합니다",async()=>{
 vi.mocked(prisma.note.findMany).mockResolvedValue([]);vi.mocked(prisma.note.count).mockResolvedValue(0);
 expect((await call('/api/v1/notes/trash',{headers:{Authorization:`Bearer ${token()}`}})).status).toBe(200);
 expect((await call('/api/v1/notes?secret=must-never-appear')).status).toBe(401);
 const file=path.join(telemetryDir,'LOCAL/api-runtime.jsonl');let text='';
 for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,20));try{text=fs.readFileSync(file,'utf8');if(text.includes('"statusCode":200'))break;}catch{}}
 const rows=text.trim().split('\n').map(line=>JSON.parse(line));
 expect(rows.some(e=>e.kind==='request'&&e.statusCode===200)).toBe(true);
 expect(rows.some(e=>e.kind==='request'&&e.statusCode===500)).toBe(true);
 expect(rows.some(e=>e.kind==='security'&&e.statusCode===401)).toBe(true);
 expect(rows.every(e=>e.environment==='LOCAL')).toBe(true);
 expect(text).not.toContain('must-never-appear');expect(text).not.toContain('database-password-never-log-this');expect(text).not.toContain('Bearer');
});

it("관측 저장소 장애가 실제 API 요청 실패로 전파되지 않습니다",async()=>{
 const blocked=path.join(telemetryDir,'not-a-directory');fs.writeFileSync(blocked,'test');vi.stubEnv('MONITOR_DIR',blocked);vi.mocked(prisma.note.findMany).mockResolvedValue([]);
 expect((await call('/api/v1/notes/trash',{headers:{Authorization:`Bearer ${token()}`}})).status).toBe(200);
 await new Promise(r=>setTimeout(r,50));vi.stubEnv('MONITOR_DIR',telemetryDir);
});
