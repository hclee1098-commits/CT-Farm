import sharp from "sharp";
import { AppError } from "../../common/app-error";
import { MAX_FILE_SIZE } from "./files.dto";
// 디코더가 전체 이미지를 확인하며 EXIF/GPS 메타데이터는 기본 제거합니다.
export async function normalizeImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (!mimeType.startsWith("image/")) return buffer;
  try {
    const pipeline = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "error", animated: false }).rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true });
    const output = await (mimeType === "image/jpeg" ? pipeline.jpeg({ quality: 85 }) : mimeType === "image/webp" ? pipeline.webp({ quality: 85 }) : pipeline.png()).toBuffer();
    if (output.length > MAX_FILE_SIZE) throw new Error("이미지 크기 초과");
    return output;
  } catch { throw new AppError(400, "INVALID_IMAGE", "이미지 구조가 올바르지 않거나 허용 크기를 초과했습니다."); }
}
export async function thumbnail(buffer: Buffer): Promise<Buffer> {
  try { return await sharp(buffer, { limitInputPixels: 40_000_000, failOn: "error" }).rotate().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); }
  catch { throw new AppError(400, "INVALID_IMAGE", "썸네일을 생성할 수 없습니다."); }
}
