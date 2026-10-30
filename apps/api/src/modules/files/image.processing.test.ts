import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizeImage, thumbnail } from "./image.processing";
describe("이미지 실제 디코딩", () => {
  it("시그니처만 있는 가짜 PNG를 거부합니다", async () => {
    await expect(normalizeImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).rejects.toMatchObject({ errorCode: "INVALID_IMAGE" });
  });
  it("이미지 메타데이터를 제거하고 썸네일 크기를 제한합니다", async () => {
    const input = await sharp({ create: { width: 600, height: 400, channels: 3, background: "red" } }).withMetadata().jpeg().toBuffer();
    const output = await normalizeImage(input, "image/jpeg");
    expect((await sharp(output).metadata()).exif).toBeUndefined();
    const info = await sharp(await thumbnail(output)).metadata(); expect(info.width).toBe(320); expect(info.height).toBe(213);
  });
  it("PDF는 이미지 디코더로 변경하지 않습니다", async () => {
    const input = Buffer.from("%PDF-test"); expect(await normalizeImage(input, "application/pdf")).toBe(input);
  });
});
