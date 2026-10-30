// 운영 데이터를 읽거나 바꾸지 않고 배포 소스의 인코딩과 잠금 파일을 검사합니다.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["node_modules", ".next", "dist", ".git", ".starter-backups", ".starter-state", "uploads"]);
let scripts = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    // 검증용 복사본/복원본은 원본 소스 개수를 중복 계산하지 않습니다.
    if (target === path.join(root, 'verification', 'runtime')) continue;
    if (entry.isDirectory() && !ignored.has(entry.name)) await scan(target);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".ps1")) {
      const bytes = await readFile(target);
      assert.equal(bytes.subarray(0, 3).toString("hex"), "efbbbf", `UTF-8 BOM 누락: ${target}`);
      assert.notEqual(bytes.subarray(3, 6).toString("hex"), "efbbbf", `중복 BOM: ${target}`);
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      scripts++;
    }
  }
}
await scan(root);
const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
for (const folder of ["", "apps/api", "apps/web"]) {
  const pkg = JSON.parse(await readFile(path.join(root, folder, "package.json"), "utf8"));
  for (const field of ["dependencies", "devDependencies"]) {
    assert.deepEqual(pkg[field] ?? {}, lock.packages[folder][field] ?? {}, `잠금 파일 불일치: ${folder}/${field}`);
  }
}
const mobile=JSON.parse(await readFile(path.join(root,'apps/mobile/package.json'),'utf8'));
const mobileLock=JSON.parse(await readFile(path.join(root,'apps/mobile/package-lock.json'),'utf8'));
for(const field of ['dependencies','devDependencies'])assert.deepEqual(mobile[field]??{},mobileLock.packages[''][field]??{},'모바일 전용 잠금 파일 불일치: '+field);
console.log(`소스 검사 통과: PS1 ${scripts}개 UTF-8 BOM, 웹/API·모바일 잠금 파일 동기화`);

