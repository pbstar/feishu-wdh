/** 清理字符串作为 ZIP 文件名（清理控制字符与非法字符，限长保底） */
export function sanitizeFilename(name: string): string {
  return (
    name
      // 控制字符与不可见格式字符（零宽、BOM、方向控制符等），会导致 Invalid filename
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/[\\/:*?"<>|.]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim() || '未命名文档'
  );
}