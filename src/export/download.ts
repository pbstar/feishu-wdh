import { sanitizeFilename } from './zip';

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

/** 确保 offscreen document 已创建（幂等） */
async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: '将导出的 ZIP 转为 Blob URL 以触发下载',
  });
}

/**
 * 触发 ZIP 下载。offscreen 负责把 base64 转成 Blob URL（SW 无此 DOM API），
 * service worker 再用该 URL 调 chrome.downloads（offscreen 无下载 API）。
 * @returns 下载使用的文件名
 */
export async function downloadZip(zipBase64: string, title: string): Promise<string> {
  const filename = `${sanitizeFilename(title)}.zip`;
  await ensureOffscreen();

  const resp = (await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'CREATE_BLOB_URL',
    base64: zipBase64,
  })) as { ok: boolean; url?: string; error?: string } | undefined;

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
