import { DOC_ROOT_SELECTOR, TITLE_SELECTOR } from '../selectors';

export { BlockCollector } from './collector';

// ── 标题提取 ──
function extractTitle(): string {
  const el = document.querySelector<HTMLElement>(TITLE_SELECTOR);
  const fromDom = el?.textContent?.trim();
  if (fromDom) return fromDom;
  // 回退到页面标题，去掉飞书后缀
  const t = document.title.replace(/\s*[-|·]\s*(飞书云文档|飞书|Lark Docs|Lark).*$/i, '').trim();
  return t || '未命名文档';
}

/** 定位文档正文根容器 */
export function getDocRoot(): HTMLElement {
  return document.querySelector<HTMLElement>(DOC_ROOT_SELECTOR) ?? document.body;
}

/** 读取文档标题 */
export function getDocTitle(): string {
  return extractTitle();
}
