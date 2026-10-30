import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextField, Pagination, DataTable, Notice } from "./index";
describe("공통 UI 정적 접근성", () => {
  it("입력 오류와 레이블을 연결합니다", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "email", label: "이메일", error: "확인해 주세요." }));
    expect(html).toContain('for="email"'); expect(html).toContain('aria-describedby="email-message"'); expect(html).toContain('aria-invalid="true"');
  });
  it("첫 페이지에서 이전 이동을 비활성화합니다", () => {
    const html = renderToStaticMarkup(createElement(Pagination, { page: 1, pageSize: 10, total: 20, onPageChange() {} }));
    expect(html).toContain('disabled=""'); expect(html).toContain("이전");
  });
  it("사용자 텍스트를 HTML로 해석하지 않습니다", () => {
    expect(renderToStaticMarkup(createElement(Notice, null, '<script>alert(1)</script>'))).not.toContain('<script>');
  });
  it("테이블 제목과 빈 상태를 제공합니다", () => {
    const html = renderToStaticMarkup(createElement(DataTable, { caption: "자료 목록", rows: [], columns: [], rowKey: () => "id" }));
    expect(html).toContain('<caption>자료 목록</caption>'); expect(html).toContain('role="status"');
  });
});
