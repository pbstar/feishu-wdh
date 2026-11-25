# 飞书文档导出助手（feishu-wdh）

一键将当前 **飞书文档** 导出为 **Markdown**，图片一并下载并打包为 ZIP。

> 文档提取与打包均在浏览器本地完成，扩展不设自有服务器、不收集任何数据。

## 功能特性

- **一键导出**：点击工具栏图标，立即导出当前文档。
- **Markdown 输出**：生成符合 GitHub Flavored Markdown (GFM) 规范的 `.md` 文件。
- **图片本地化**：文档中的图片下载至 `images/` 目录，Markdown 使用相对路径引用。
- **ZIP 打包**：将 `.md` 文件与 `images/` 目录一同打包，压缩包以文档标题命名。
- **富文本处理**：支持标题、列表、表格、代码块、引用、加粗/斜体等常见格式。
- **断点续显**：导出过程中关闭弹窗后重新打开，自动恢复显示当前进度与上次导出结果。
- **完全本地**：导出流程在浏览器中执行，无需上传内容至任何服务器。

## 支持的文档类型

| 类型 | 说明 |
| --- | --- |
| Docx | 飞书新版文档 |
| Wiki | 知识库文档 |

支持域名：`feishu.cn`、`larksuite.com`。

## 使用方法

1. 打开一个飞书文档页面。
2. 点击浏览器工具栏中的扩展图标，在弹窗中点击 **「导出 Markdown」**。
3. 等待处理完成，浏览器将自动下载 ZIP 文件。
4. 解压后即可获得 `文档标题.md` 及配套的 `images/` 目录。

## 安装

### 方式一：下载压缩包安装（推荐）

1. 从项目的 [`versions/`](versions/) 目录下载最新的 `feishu-wdh-vX.X.X.zip`。
2. 解压到本地任意目录。
3. 打开 Chrome，访问 `chrome://extensions/`。
4. 打开右上角「开发者模式」。
5. 点击「加载已解压的扩展程序」，选择解压后的目录。

### 方式二：从源码构建（开发者模式）

确保已安装 Node.js，然后执行：

```bash
git clone https://github.com/pbstar/feishu-wdh.git
cd feishu-wdh
npm install
npm run build
```

构建完成后：

- `dist/` 为可加载的扩展产物。
- `versions/feishu-wdh-vX.X.X.zip` 为按当前版本号自动打包的压缩包。

加载步骤：

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择项目中的 `dist/` 目录。

> 执行 `npm run build` 即可完成 TypeScript 类型检查、构建，并自动打包为 `versions/` 压缩包。

## 技术栈

- **Manifest V3** – Chrome 扩展标准
- **Content Script** – 只读提取文档 DOM，边滚边采并就地抓图
- **自研转换器** – 结构化节点树 → GFM Markdown（`src/converter/`）
- **JSZip** – 客户端 ZIP 打包
- **Offscreen Document + chrome.downloads** – 生成 Blob URL 在离屏文档中执行，规避 MV3 service worker 生命周期限制；下载仍由 service worker 触发
- **Vite + @crxjs/vite-plugin** – 构建打包

## 项目结构

```
feishu-wdh/
├── src/
│   ├── content/      # 内容脚本：滚动预加载 + 只读提取文档结构 + 抓图
│   ├── converter/    # Markdown 转换逻辑
│   ├── export/       # ZIP 打包、下载
│   ├── background/   # service worker：消息路由、编排导出流程
│   ├── offscreen/    # 离屏文档：Blob URL 触发下载（规避 SW 生命周期限制）
│   ├── shared/       # 跨模块类型、消息、存储封装
│   ├── styles/       # 公共样式
│   └── popup/        # 扩展弹窗 UI
├── public/
│   └── icons/        # 扩展图标
├── scripts/
│   └── pack.mjs      # 构建后将 dist 打包为 versions/*.zip
├── src/manifest.config.ts # 扩展清单（TS 形式）
├── versions/         # 各版本打包产物（.zip）
└── dist/             # 构建产物
```

## 隐私说明

- 本扩展不包含自有服务器，**不会收集、留存任何用户数据**，亦不出售用户信息。
- 文档的提取、图片下载与 ZIP 打包均在本地浏览器中完成，不发送至任何服务器。

## 许可证

MIT
