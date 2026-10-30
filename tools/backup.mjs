import { appendEvents } from './monitoring/core.mjs';
import { randomUUID } from 'node:crypto';
// 인증된 암호화 백업: 복원은 명명 규칙에 맞는 비어 있는 격리 DB만 허용합니다.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const MAX = 128 * 1024 * 1024;
const MAGIC = Buffer.from('SSV6BK01');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function key() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_KEY ?? '')) throw new Error('BACKUP_KEY는 32바이트 HEX 형식이어야 합니다.');
  return Buffer.from(process.env.BACKUP_KEY, 'hex');
}
export function encryptBackup(payload, encryptionKey = key()) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}
export function decryptBackup(bytes, encryptionKey = key()) {
  if (bytes.length > MAX * 2 || !bytes.subarray(0, 8).equals(MAGIC)) throw new Error('백업 형식 또는 크기 오류');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(8, 20));
  decipher.setAAD(MAGIC); decipher.setAuthTag(bytes.subarray(20, 36));
  const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]).toString('utf8'));
  validatePayload(payload);
  return payload;
}
export function validatePayload(payload) {
  if (payload.version !== 1 || !/^[a-z][a-z0-9_-]{2,63}$/.test(payload.project) || !Array.isArray(payload.files) || payload.files.length > 10000) throw new Error('백업 명세 오류');
  const seen = new Set(); let total = 0;
  for (const file of [{ name: 'database.dump', ...payload.database }, ...payload.files]) {
    if (typeof file.name !== 'string' || file.name.includes('..') || !/^[a-zA-Z0-9_.-]+$/.test(file.name) || seen.has(file.name) || typeof file.data !== 'string') throw new Error('안전하지 않은 백업 경로');
    seen.add(file.name);
    const bytes = Buffer.from(file.data, 'base64'); total += bytes.length;
    if (hash(bytes) !== file.sha256 || total > MAX) throw new Error('백업 무결성 또는 크기 오류');
  }
  if (!payload.database?.data) throw new Error('DB 백업 누락');
}
function pg(urlText) {
  const url = new URL(urlText);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL URL이 필요합니다.');
  if ([...url.searchParams].some(([name, value]) => name !== 'schema' || value !== 'public')) throw new Error('백업 URL은 schema=public 외 쿼리를 지원하지 않습니다. PGSSLMODE/PGSSLROOTCERT를 설정하세요.');
  const database = decodeURIComponent(url.pathname.slice(1));
  return { database, env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: database, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10' } };
}
async function capture(name, directory) {
  const target = path.join(directory, name), stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX) throw new Error('일반 파일만 백업할 수 있습니다.');
  const data = await fs.readFile(target); return { name, data: data.toString('base64'), sha256: hash(data) };
}
async function run() {
  const [command, argument] = process.argv.slice(2);
  const project = process.env.BACKUP_PROJECT;
  const directory = path.resolve(process.env.BACKUP_DIR || './backups');
  if (command === 'list') {
    for (const name of (await fs.readdir(directory)).filter(name => name.endsWith('.ssbk')).sort()) console.log(name);
    return;
  }
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(project ?? '')) throw new Error('BACKUP_PROJECT 식별자가 필요합니다.');
  key();
  if (command === 'create' && process.env.BACKUP_QUIESCED !== '1') throw new Error('API/작업자를 중지한 뒤 BACKUP_QUIESCED=1로 일관된 백업을 생성하세요.');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ssv6-backup-'));
  try {
    if (command === 'create') {
      const connection = pg(process.env.DATABASE_URL);
      await exec('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', path.join(temporary, 'database.dump')], { env: connection.env, timeout: 300000 });
      const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './apps/api/uploads');
      const rootStat = await fs.lstat(uploadRoot);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('저장소 루트 링크 거부');
      const database = await capture('database.dump', temporary);
      let total = Buffer.byteLength(database.data, 'base64');
      const files = [];
      for (const entry of await fs.readdir(uploadRoot, { withFileTypes: true })) {
        // 내부 삭제 저널과 잠금은 데이터 파일이 아닙니다.
        if (entry.name.startsWith('.')) continue;
        if (files.length >= 10000 || (await fs.lstat(path.join(uploadRoot, entry.name))).size + total > MAX) throw new Error('백업 총 크기 제한 초과');
        const captured = await capture(entry.name, uploadRoot);
        total += Buffer.byteLength(captured.data, 'base64');
        if (total > MAX) throw new Error('백업 총 크기 제한 초과');
        files.push(captured);
      }
      const payload = { version: 1, project, createdAt: new Date().toISOString(), database, files };
      validatePayload(payload);
      const encrypted = encryptBackup(payload);
      decryptBackup(encrypted);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const target = path.join(directory, `${project}-${Date.now()}-${randomBytes(4).toString('hex')}.ssbk`);
      await fs.writeFile(target, encrypted, { flag: 'wx', mode: 0o600 });
      console.log(`백업 생성 및 무결성 검사 완료: ${path.basename(target)}`);
    } else if (['verify', 'restore-isolated'].includes(command)) {
      const input = path.resolve(argument ?? '');
      if ((await fs.stat(input)).size > MAX * 2) throw new Error('백업 크기 제한 초과');
      const payload = decryptBackup(await fs.readFile(input));
      if (payload.project !== project) throw new Error('백업 프로젝트 식별자 불일치');
      const dumpPath = path.join(temporary, 'database.dump');
      await fs.writeFile(dumpPath, Buffer.from(payload.database.data, 'base64'), { flag: 'wx', mode: 0o600 });
      await exec('pg_restore', ['--list', dumpPath], { timeout: 30000 });
      if (command === 'verify') { console.log('암호화·SHA-256·PG 아카이브 검사 통과'); return; }
      const connection = pg(process.env.RESTORE_DATABASE_URL);
      if (!/^starter_restore_[a-f0-9]{12}$/.test(connection.database)) throw new Error('격리 복원 DB 이름 형식: starter_restore_<12자리 HEX>');
      const result = await exec('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')"], { env: connection.env, timeout: 30000 });
      if (result.stdout.trim() !== '0') throw new Error('비어 있는 격리 DB에만 복원할 수 있습니다.');
      const destination = path.resolve(process.env.RESTORE_UPLOAD_DIR || '');
      if (!process.env.RESTORE_UPLOAD_DIR || await fs.lstat(destination).then(() => true, () => false)) throw new Error('복원 파일 경로는 존재하지 않는 새 디렉터리여야 합니다.');
      // DB와 파일 간 원자성을 제공하지 않습니다. DB 트랜잭션 실패 시 파일을 쓰지 않습니다.
      await exec('pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', connection.database, dumpPath], { env: connection.env, timeout: 300000 });
      await fs.mkdir(destination, { mode: 0o700 });
      for (const file of payload.files) await fs.writeFile(path.join(destination, file.name), Buffer.from(file.data, 'base64'), { flag: 'wx', mode: 0o600 });
      await exec('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'], { env: connection.env, timeout: 30000 });
      console.log('격리 복원 완료. 서비스별 행 수·로그인·파일 검증을 이어서 실행하세요.');
    } else throw new Error('사용법: node tools/backup.mjs create|list|verify <파일>|restore-isolated <파일>');
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report=result=>{if(process.argv[2]!=='create')return;try{appendEvents(process.env.MONITOR_DIR||path.resolve('.starter-state/monitoring'),process.env.APP_ENV||'LOCAL',[{id:randomUUID(),environment:process.env.APP_ENV||'LOCAL',time:new Date().toISOString(),service:'backup',kind:'backup',level:result==='success'?'info':'error',result}]);}catch{}};
  run().then(()=>report('success')).catch(() => { report('failed'); console.error('백업 작업 실패: 설정, 대상 격리, 도구 설치 및 무결성을 확인하세요. 인증정보는 출력하지 않습니다.'); process.exitCode = 1; });
}
