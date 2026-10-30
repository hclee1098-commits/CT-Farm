// 읽기 전용: 고아 파일을 자동 삭제하지 않습니다.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readdir, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const db = new PrismaClient();
async function run() {
  const root = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  if ((await lstat(root)).isSymbolicLink()) throw new Error("저장소 루트 링크 거부");
  const entries = await readdir(root); const keys = new Set(entries);
  const missing: string[] = [], invalid: string[] = [], legacy: string[] = [];
  const referenced = new Set<string>(); let cursor: string | undefined;
  // 데이터 크기에 비례하여 전체 DB 행을 메모리에 올리지 않도록 분할 조회합니다.
  while (true) {
    const rows = await db.storedFile.findMany({ take: 200, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!rows.length) break;
    for (const row of rows) {
      referenced.add(row.storageKey);
      if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(row.storageKey)) { invalid.push(row.id); continue; }
      if (!keys.has(row.storageKey)) { missing.push(row.id); continue; }
      const filePath = path.join(root, row.storageKey), stat = await lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.size || stat.size > 5 * 1024 * 1024) { invalid.push(row.id); continue; }
      if (!row.sha256) { legacy.push(row.id); continue; }
      if (crypto.createHash("sha256").update(await readFile(filePath)).digest("hex") !== row.sha256) invalid.push(row.id);
    }
    cursor = rows[rows.length - 1]!.id;
  }
  const orphans = entries.filter(name => !name.startsWith(".") && !referenced.has(name));
  console.log(JSON.stringify({ missing, invalid, legacyHashMissing: legacy, orphanCount: orphans.length, readOnly: true }, null, 2));
  if (missing.length || invalid.length || orphans.length) process.exitCode = 1;
}
run().catch(() => { console.error("정합성 검사 실패. 연결과 저장소 경로를 확인하세요."); process.exitCode = 1; }).finally(() => db.$disconnect());
