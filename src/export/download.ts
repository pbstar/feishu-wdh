import { sanitizeFilename } from '../shared/filename';
import { ensureOffscreen, sendToOffscreen } from '../shared/offscreen';
import type { CreateBlobUrlRequest, CreateBlobUrlResponse } from '../shared/offscreen';

/**
 * 触发 ZIP 下载。offscreen 负责把 base64 转成 Blob URL（SW 无此 DOM API），
 * service worker 再用该 URL 调 chrome.downloads（offscreen 无下载 API）。
 * @returns 下载使用的文件名
 */
export async function downloadZip(zipBase64: string, title: string): Promise<string> {
  const filename = `${sanitizeFilename(title)}.zip`;
  // AI 阶段可能已创建过 offscreen，此处幂等复用
  await ensureOffscreen();

  const req: CreateBlobUrlRequest = {
    target: 'offscreen',
    type: 'CREATE_BLOB_URL',
    base64: zipBase64,
  };
  const resp = await sendToOffscreen<CreateBlobUrlResponse | undefined>(req);

  if (!resp?.ok || !resp.url) {
    throw new Error(resp?.error || '生成下载链接失败');
  }

  try {
    await chrome.downloads.download({ url: resp.url, filename, saveAs: false });
    return filename;
  } catch {
    // 文件名仍被拒绝时降级为兜底名，保证导出不失败
    const fallback = '飞书文档导出.zip';
    await chrome.downloads.download({ url: resp.url, filename: fallback, saveAs: false });
    return fallback;
  }
}
