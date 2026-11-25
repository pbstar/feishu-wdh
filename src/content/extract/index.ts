import { DOC_ROOT_SELECTOR, TITLE_SELECTOR } from '../selectors';

export { BlockCollector } from './collector';

/** 定位文档正文根容器 */
export function getDocRoot(): HTMLElement {
  return document.querySelector<HTMLElement>(DOC_ROOT_SELECTOR) ?? document.body;
}

/** 读取文档标题：优先页面标题元素，回退到浏览器标题（去掉飞书后缀） */
export function getDocTitle(): string {
  const fromDom = document.querySelector<HTMLElement>(TITLE_SELECTOR)?.textContent?.trim();
  if (fromDom) return fromDom;
  const t = document.title.replace(/\s*[-|·]\s*(飞书云文档|飞书|Lark Docs|Lark).*$/i, '').trim();
  return t || '未命名文档';
}
