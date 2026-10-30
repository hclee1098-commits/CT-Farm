// 모든 웹 API 호출이 같은 설정 우선순위와 출처를 사용합니다.
export function resolveApiOrigin(value: string): string {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
      url.search || url.hash || !["/", "/api/v1", "/api/v1/"].includes(url.pathname)) {
    throw new Error("API 주소에는 HTTP(S) 출처 또는 /api/v1 주소를 지정하세요.");
  }
  return url.origin;
}

const configuredOrigin =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";
// 같은 이미지를 서로 다른 도메인으로 승격하며 SSR에서는 상대 경로를 유지합니다.
export const API_ORIGIN = configuredOrigin === "same-origin" ? (typeof window === "undefined" ? "" : window.location.origin) : resolveApiOrigin(configuredOrigin);
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

