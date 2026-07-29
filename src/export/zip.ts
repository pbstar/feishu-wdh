import JSZip from 'jszip';
import type { FetchedImage } from '../shared/types';

/** 清理文件名中的非法字符 */
export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || '未命名文档'
  );
}

/**
 * 打包 Markdown + 图片为 ZIP，返回 base64（不含 data 前缀）。
 * 在 service worker 中运行，故用 base64 输出（无法用 blob URL）。
 */
export async function packageZip(
  title: string,
  markdown: string,
  images: FetchedImage[],
): Promise<string> {
  const zip = new JSZip();
  const safeTitle = sanitizeFilename(title);
  zip.file(`${safeTitle}.md`, markdown);

  const imagesFolder = zip.folder('images');
  for (const img of images) {
    if (img.failed || !img.base64 || !img.localPath) continue;
    // localPath 形如 images/img-1.png，去掉前缀存入 images 文件夹
    const filename = img.localPath.replace(/^images\//, '');
    imagesFolder?.file(filename, img.base64, { base64: true });
  }

  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}
