import { onRuntimeMessage } from '../shared/messaging';
import type { DocumentModel, ExtractResultMsg, ProgressMsg, RuntimeMessage } from '../shared/types';
import { findScrollContainer, scrollAndCollect } from './scroll';
import { BlockCollector, getDocRoot, getDocTitle } from './extract';

function reportProgress(progress: ProgressMsg['progress']): void {
  const msg: ProgressMsg = { type: 'PROGRESS', progress };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* popup 可能已关闭，忽略 */
  });
}

async function runExtract(): Promise<ExtractResultMsg> {
  const container = findScrollContainer();
  const root = getDocRoot();
  const collector = new BlockCollector(container);

  // 边滚边采：飞书虚拟滚动会回收离开视口的 DOM，必须逐屏采集；
  // 图片也在采集当屏就地抓取（blob URL 随 block 回收即失效）。
  reportProgress({ stage: 'scrolling', message: '正在滚动加载并采集全文…' });
  await scrollAndCollect(
    container,
    () => collector.collectSlice(root),
    (ratio) => {
      const { total, failed } = collector.imageStats();
      reportProgress({
        stage: 'scrolling',
        message: `正在滚动采集 ${Math.round(ratio * 100)}%${total ? `（图片 ${total} 张${failed ? `，失败 ${failed}` : ''}）` : ''}…`,
      });
    },
  );

  reportProgress({ stage: 'extracting', message: '正在整理文档结构…' });
  const doc: DocumentModel = { title: getDocTitle(), blocks: collector.finalize() };
  const images = collector.getImages();

  return { type: 'EXTRACT_RESULT', doc, images };
}

onRuntimeMessage((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT') {
    runExtract()
      .then((result) => sendResponse(result))
      .catch((err) => {
        reportProgress({ stage: 'error', message: String(err?.message ?? err) });
        sendResponse({ type: 'EXTRACT_RESULT', error: String(err?.message ?? err) });
      });
    return true; // 异步响应
  }
});
