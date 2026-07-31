import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const versionsDir = join(root, 'versions');

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'));

if (!existsSync(distDir)) {
  console.error('[pack] 未找到 dist 目录，请先执行 vite build。');
  process.exit(1);
}

// 递归收集 dist 下所有文件
function collectFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full));
    else files.push(full);
  }
  return files;
}

const zip = new JSZip();
for (const file of collectFiles(distDir)) {
  const rel = relative(distDir, file).split('\\').join('/');
  zip.file(rel, createReadStream(file));
}

mkdirSync(versionsDir, { recursive: true });
const zipName = `feishu-wdh-v${pkg.version}.zip`;
const zipPath = join(versionsDir, zipName);

await new Promise((res, rej) => {
  zip
    .generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 9 } })
    .pipe(createWriteStream(zipPath))
    .on('finish', res)
    .on('error', rej);
});

console.log(`[pack] 已生成 versions/${zipName}`);
