import { DOC_ROOT_SELECTORS, TITLE_SELECTORS, queryFirst } from '../selectors';

export { BlockCollector } from './collector';

// ── 标题提取 ──
function extractTitle(): string {
  const el = queryFirst<HTMLElement>(TITLE_SELECTORS);
  const fromDom = el?.textContent?.trim();
  if (fromDom) return fromDom;
  // 回退到页面标题，去掉飞书后缀
  const t = document.title.replace(/\s*[-|·]\s*(飞书云文档|飞书|Lark Docs|Lark).*$/i, '').trim();
  return t || '未命名文档';
}

/** 定位文档正文根容器 */
export function getDocRoot(): HTMLElement {
  return queryFirst<HTMLElement>(DOC_ROOT_SELECTORS) || document.body;
}

/** 读取文档标题 */
export function getDocTitle(): string {
  return extractTitle();
}
