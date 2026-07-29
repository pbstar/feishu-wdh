// 飞书 DOM 选择器集中管理。飞书前端结构可能随版本变化，
// 所有硬编码选择器统一放此处，便于后续维护更新。

/** 主滚动容器候选（虚拟滚动的滚动宿主） */
export const SCROLL_CONTAINER_SELECTORS = [
  '.bear-web-x-container',
  '.docx-scroller',
  '.docs-reader-body',
  '.etimer-container',
  '#mainContainer',
];

/** 文档正文根容器候选 */
export const DOC_ROOT_SELECTORS = [
  '.docx-page-block-children',
  '.page-block-children',
  '.bear-web-x-container .render-unit-wrapper',
  '.docx-editor',
  '.note-editor',
];

/** 文档标题候选 */
export const TITLE_SELECTORS = [
  '.docx-title',
  '.doc-title',
  '.title-editor',
  '[data-page-title]',
  'h1.title',
];

/**
 * 在候选选择器中找到第一个存在的元素。
 */
export function queryFirst<T extends Element = HTMLElement>(
  selectors: string[],
  root: ParentNode = document,
): T | null {
  for (const sel of selectors) {
    const el = root.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}
