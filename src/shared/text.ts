// 文本清洗：飞书 DOM 大量插入零宽字符（U+200B 零宽空格、U+200C/200D 连接符、
// U+FEFF BOM）做排版，提取文本时统一剔除，避免进入 Markdown 产物。
const INVISIBLE = /[\u200B-\u200D\uFEFF]/g;

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, '');
}
