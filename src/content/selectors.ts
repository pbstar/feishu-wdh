// 飞书 docx DOM 选择器集中管理。飞书前端结构可能随版本变化，
// 全部选择器只保留当前真实结构，调整时在此一处修改。

/** 文档正文根容器（文档标题区块之外的全部内容） */
export const DOC_ROOT_SELECTOR = '.page-block-children';

/** 文档标题 */
export const TITLE_SELECTOR = 'h1.page-block-content';

/** 块 ID 属性：正文中每个块都带，用于跨屏去重、排序与合并 */
export const BLOCK_ID_ATTR = 'data-block-id';

/** 代码块内部滚动区：长代码块带内部滚动、只渲染可视行 */
export const CODE_SCROLLER_SELECTOR = '.code-block-content';
