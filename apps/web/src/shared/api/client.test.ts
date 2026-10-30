import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { resolveApiOrigin } from "./config";
import { resilientRequest } from "./resilient-request";
import { authorizedFetch, setAccessToken, clearAccessToken, loginRequest } from "../auth/auth-client";
const ok = () => new Response(JSON.stringify({ success: true, data: { value: 1 } }), { headers: { "Content-Type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearAccessToken(); });
describe("웹 공통 보안 요청", () => {
  it("인증 요청의 JSON 형식을 지정하고 사진 multipart 경계는 브라우저에 맡깁니다", async () => {
    const fetch = vi.fn(async () => ok()); vi.stubGlobal("fetch", fetch); setAccessToken("fixture");
    await authorizedFetch("/farms", { method: "POST", body: JSON.stringify({ name: "농장" }) });
    const form = new FormData(); form.append("caption", "사진");
    await authorizedFetch("/files", { method: "POST", body: form });
    const first = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const second = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(first[1].headers).get("Content-Type")).toContain("application/json");
    expect(new Headers(second[1].headers).has("Content-Type")).toBe(false);
  });
  it.each(["/../../outside", "/%2e%2e/%2e%2e/outside", "/notes\n", "//other.test", "/\\other.test"])("공통 클라이언트가 경로 %s를 전송 전에 거부합니다", async (path) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = createApiClient({ getAccessToken: () => "secret" });
    await expect(client.request({ path })).rejects.toMatchObject({ errorCode: "INVALID_API_PATH" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("API 주소 설정을 공통 규칙으로 해석합니다", () => {
    expect(resolveApiOrigin("http://localhost:4000/api/v1")).toBe("http://localhost:4000");
    expect(() => resolveApiOrigin("https://user:pass@example.com")).toThrow();
    expect(() => resolveApiOrigin("file:///private")).toThrow();
  });
  it("동시 401은 한 번만 갱신하고 조회를 재시도합니다", async () => {
    const fetch = vi.fn(async (_url, options: RequestInit) => new Headers(options.headers).get("Authorization") === "Bearer renewed" ? ok() : new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const refresh = vi.fn(async () => "renewed");
    const client = createApiClient({ getAccessToken: () => "expired", refreshAccessToken: refresh });
    const results = await Promise.all([client.request({ path: "/notes" }), client.request({ path: "/files" })]);
    expect(results).toHaveLength(2); expect(refresh).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("인증 갱신 후 변경 요청은 자동 재전송하지 않습니다", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 })); vi.stubGlobal("fetch", fetch);
    const client = createApiClient({ getAccessToken: () => "expired", refreshAccessToken: async () => "renewed" });
    await expect(client.request({ path: "/notes", method: "POST", body: { title: "test" } })).rejects.toMatchObject({ errorCode: "RETRY_REQUIRED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("인증 헤더가 포함된 요청의 리다이렉트는 차단합니다", async () => {
    const fetch = vi.fn(async () => ok()); vi.stubGlobal("fetch", fetch);
    setAccessToken("secret");
    await authorizedFetch("/notes");
    await resilientRequest("/notes", { accessToken: "secret" });
    await createApiClient({ getAccessToken: () => "secret" }).request({ path: "/notes" });
    for (const call of fetch.mock.calls) expect((call as unknown as [string, RequestInit])[1].redirect).toBe("error");
  });
  it("로그인 응답 지연에도 타임아웃을 적용합니다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const result = loginRequest("a@example.com", "test");
    const assertion = expect(result).rejects.toMatchObject({ errorCode: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15000); await assertion;
  });
});

it("로그아웃 이후 늦게 도착한 로그인 응답이 메모리 토큰을 복원하지 않습니다", async () => {
  const { getAccessToken } = await import("../auth/auth-client");
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  const task = loginRequest("a@example.com", "password");
  // 인증 쿠키 요청 큐가 실제 네트워크 요청을 시작한 뒤 로그아웃을 재현합니다.
  await Promise.resolve();
  await Promise.resolve();
  clearAccessToken();
  resolve(new Response(JSON.stringify({ success: true, data: { accessToken: "late-token", user: { id: "1", name: "test", email: "a@example.com" } } })));
  await expect(task).rejects.toMatchObject({ errorCode: "AUTH_STATE_CHANGED" });
  expect(getAccessToken()).toBeNull();
});

