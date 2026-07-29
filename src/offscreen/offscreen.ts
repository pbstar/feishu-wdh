// offscreen document：拥有 DOM 能力，负责把 base64 转成 Blob URL。
// MV3 service worker 无 URL.createObjectURL，故在此创建；但 chrome.downloads
// 在 offscreen 文档中不可用，下载动作由 service worker 完成。

interface CreateBlobMsg {
  target: 'offscreen';
  type: 'CREATE_BLOB_URL';
  base64: string;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

chrome.runtime.onMessage.addListener(
  (msg: CreateBlobMsg, _sender, sendResponse) => {
    if (msg.target !== 'offscreen' || msg.type !== 'CREATE_BLOB_URL') return;

    try {
      const blob = base64ToBlob(msg.base64, 'application/zip');
      const url = URL.createObjectURL(blob);
      // 下载启动后延迟撤销，确保浏览器已完整读取 blob
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      sendResponse({ ok: true, url });
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
    return true; // 异步响应
  },
);
