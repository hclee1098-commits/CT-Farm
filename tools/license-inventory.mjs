import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const packages = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const target = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) { await walk(target); continue; }
    try {
      const value = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
      packages.push({ name: value.name, version: value.version, license: value.license ?? value.licenses ?? 'UNKNOWN', path: path.relative(process.cwd(), target) });
    } catch {}
    try { await walk(path.join(target, 'node_modules')); } catch {}
  }
}
await walk(path.resolve('node_modules'));
packages.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
await writeFile('verification/license-inventory.json', JSON.stringify({ scope: '설치된 패키지 메타데이터, 법률 검토 또는 완전한 SBOM이 아님', packages }, null, 2));
console.log(`패키지 라이선스 메타데이터 ${packages.length}건 기록`);
