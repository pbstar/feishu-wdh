import JSZip from 'jszip';
import type { FetchedImage } from '../shared/types';
import { sanitizeFilename } from '../shared/filename';

/**
 * 打包 AI 优化版 Markdown + 图片为 ZIP，返回 base64（不含 data 前缀）。
 * 主文件为「标题.md」，extra 为可选附加文件（如任务清单）。
 * 在 service worker 中运行，故用 base64 输出（无法用 blob URL）。
 */
export async function packageZip(
  title: string,
  markdown: string,
  images: FetchedImage[],
  extra: Array<{ filename: string; content: string }> = [],
): Promise<string> {
  const zip = new JSZip();
  const safeTitle = sanitizeFilename(title);
  zip.file(`${safeTitle}.md`, markdown);
  for (const item of extra) {
    zip.file(item.filename, item.content);
  }

  // 仅当存在成功抓取的图片时才创建 images 文件夹，避免无图文档生成空目录
  const succeeded = images.filter((img) => !img.failed && img.base64 && img.localPath);
  if (succeeded.length) {
    const imagesFolder = zip.folder('images');
    for (const img of succeeded) {
      // localPath 形如 images/img-1.png，去掉前缀存入 images 文件夹
      const filename = img.localPath.replace(/^images\//, '');
      imagesFolder?.file(filename, img.base64, { base64: true });
    }
  }

  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}
