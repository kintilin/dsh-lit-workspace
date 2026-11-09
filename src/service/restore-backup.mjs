import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dataDir = path.join(here, 'data');
const dbPath = path.join(dataDir, 'library.db');
const pdfDir = path.join(dataDir, 'pdfs');

const zipPath = process.argv[2];
if (!zipPath || !fs.existsSync(zipPath)) {
  console.error('用法: node restore-backup.mjs <备份.zip>');
  process.exit(1);
}

async function ensureServiceStopped() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch('http://127.0.0.1:8765/api/health', { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      console.error('litd 仍在运行。请先停止 litd，再执行恢复。');
      process.exit(1);
    }
  } catch (error) {
    // Connection refused is expected when the service is stopped.
  }
}

await ensureServiceStopped();

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const tempDir = fs.mkdtempSync(path.join(dataDir, 'restore-'));
const oldDir = path.join(dataDir, `pre-restore-${stamp}`);
let moved = false;

try {
  const result = spawnSync('tar', ['-x', '-f', zipPath, '-C', tempDir], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `tar exited ${result.status}`);

  const restoredDb = path.join(tempDir, 'library.db');
  if (!fs.existsSync(restoredDb)) throw new Error('备份中没有 library.db');

  fs.mkdirSync(oldDir, { recursive: true });
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, path.join(oldDir, 'library.db'));
  if (fs.existsSync(path.join(dataDir, 'library.db-wal'))) {
    fs.copyFileSync(path.join(dataDir, 'library.db-wal'), path.join(oldDir, 'library.db-wal'));
  }
  if (fs.existsSync(pdfDir)) fs.cpSync(pdfDir, path.join(oldDir, 'pdfs'), { recursive: true });

  for (const suffix of ['', '-wal', '-shm']) {
    const file = path.join(dataDir, `library.db${suffix}`);
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  fs.copyFileSync(restoredDb, dbPath);

  fs.rmSync(pdfDir, { recursive: true, force: true });
  fs.mkdirSync(pdfDir, { recursive: true });
  const restoredPdfDir = path.join(tempDir, 'pdfs');
  if (fs.existsSync(restoredPdfDir)) fs.cpSync(restoredPdfDir, pdfDir, { recursive: true });
  moved = true;

  console.log(`恢复完成。旧数据保留在 ${oldDir}`);
  console.log('现在重新启动 litd。');
} catch (error) {
  if (moved) {
    console.error('恢复失败，正在回滚…');
    try {
      fs.copyFileSync(path.join(oldDir, 'library.db'), dbPath);
      fs.rmSync(pdfDir, { recursive: true, force: true });
      fs.mkdirSync(pdfDir, { recursive: true });
      if (fs.existsSync(path.join(oldDir, 'pdfs'))) {
        fs.cpSync(path.join(oldDir, 'pdfs'), pdfDir, { recursive: true });
      }
      console.error('已回滚到恢复前数据。');
    } catch (rollbackError) {
      console.error('回滚失败：', rollbackError.message);
    }
  }
  console.error('恢复失败：', error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
