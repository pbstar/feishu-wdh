const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

/** 从 MIME 推断文件扩展名 */
export function extFromMime(mime: string): string {
  return MIME_EXT[mime] || 'png';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 data:...;base64, 前缀
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface CapturedImage {
  base64: string;
  mime: string;
}

/**
 * 抓取单张图片为 base64。必须在图片仍存活于 DOM 时调用：
 * 飞书正文图多为 blob: URL，一旦所在 block 被虚拟滚动回收，blob 即被 revoke，
 * 此后再 fetch 必然失败。故抓取时机是「采集该屏时就地抓」，而非滚完统一抓。
 */
export async function fetchImageToBase64(src: string): Promise<CapturedImage | null> {
  try {
    const resp = await fetch(src, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const mime = blob.type || 'image/png';
    const base64 = await blobToBase64(blob);
    if (!base64) return null;
    return { base64, mime };
  } catch {
    return null;
  }
}
