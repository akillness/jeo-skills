# MR Office — 简体中文

<p align="center"><sub>🌐 <a href="../README.md">English</a> · <a href="../i18n/README.en-GB.md">English (UK)</a> · <a href="../i18n/README.zh.md">简体中文</a> · <a href="../i18n/README.zh-TW.md">繁體中文</a> · <a href="../i18n/README.ja.md">日本語</a> · <a href="../i18n/README.ko.md">한국어</a> · <a href="../i18n/README.de.md">Deutsch</a> · <a href="../i18n/README.fr.md">Français</a> · <a href="../i18n/README.es.md">Español</a> · <a href="../i18n/README.es-419.md">Español (Latinoamérica)</a> · <a href="../i18n/README.pt-BR.md">Português (Brasil)</a> · <a href="../i18n/README.it.md">Italiano</a> · <a href="../i18n/README.nl.md">Nederlands</a> · <a href="../i18n/README.sv.md">Svenska</a> · <a href="../i18n/README.da.md">Dansk</a> · <a href="../i18n/README.no.md">Norsk</a> · <a href="../i18n/README.fi.md">Suomi</a> · <a href="../i18n/README.id.md">Bahasa Indonesia</a> · <a href="../i18n/README.th.md">ไทย</a> · <a href="../i18n/README.vi.md">Tiếng Việt</a></sub></p>

<p align="center"><b>MR Office 的开源编辑器，最贴近 Microsoft Office 的 AI 办公套件：在浏览器中处理文档、表格、演示文稿、PDF 和代码，还有 AI 与你一起编辑真实的 Word、Excel 和 PowerPoint 文件。</b></p>

<p align="center"><a href="https://mroffice.ai"><b>▶ 在线试用</b></a> · <a href="https://mroffice.ai/office/download"><b>⬇ 下载</b></a> · <a href="https://mroffice.ai">🌐 mroffice.ai</a><br><a href="https://mroffice.ai/developers">🧑‍💻 开发者</a> · <a href="https://mroffice.ai/developers/embed">🧩 嵌入</a> · <a href="https://mroffice.ai/developers/mcp">🤖 AI 应用的 MCP</a> · <a href="https://www.npmjs.com/package/mroffice-embed">📦 npm SDK</a> · <a href="https://mroffice.ai/developers/oauth">🔑 用 MR Office 登录</a></p>

<p align="center"><a href="../LICENSE"><img alt="AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue"></a> <a href="https://github.com/XinaTian/MROffice/releases"><img alt="release" src="https://img.shields.io/github/v/release/XinaTian/MROffice"></a> <a href="https://github.com/XinaTian/MROffice/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/XinaTian/MROffice/actions/workflows/ci.yml/badge.svg"></a> <a href="https://github.com/XinaTian/MROffice/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/XinaTian/MROffice?style=social"></a></p>

<p align="center"><a href="https://mroffice.ai"><img src="../docs/media/mr-office-demo.webp" alt="MR Office 的开源编辑器，最贴近 Microsoft Office 的 AI 办公套件：在浏览器中处理文档、表格、演示文稿、PDF 和代码，还有 AI 与你一起编辑真实的 Word、Excel 和 PowerPoint 文件。" width="100%"></a></p>

<p align="center"><a href="https://demo.mroffice.ai/media/mr-office-demo.mp4">🔊 观看 50 秒介绍视频（有声）</a></p>

<table>
<tr>
<td align="center" width="50%"><a href="https://mroffice.ai"><img src="../docs/screenshots/docs.png" alt="文档" width="100%"></a><br><b>文档</b></td>
<td align="center" width="50%"><a href="https://mroffice.ai"><img src="../docs/screenshots/sheets.png" alt="表格" width="100%"></a><br><b>表格</b></td>
</tr>
<tr>
<td align="center" width="50%"><a href="https://mroffice.ai"><img src="../docs/screenshots/slides.png" alt="演示文稿" width="100%"></a><br><b>演示文稿</b></td>
<td align="center" width="50%"><a href="https://mroffice.ai"><img src="../docs/screenshots/pdf.png" alt="PDF" width="100%"></a><br><b>PDF</b></td>
</tr>
<tr>
<td align="center" width="50%"><a href="https://mroffice.ai"><img src="../docs/screenshots/code.png" alt="代码" width="100%"></a><br><b>代码</b></td>
</tr>
</table>

MR Office 是一款面向真实文件的 AI 办公套件：Word、Excel、PowerPoint 和 PDF，支持网页端和免费桌面应用，每个文档旁都有 AI 相伴，并支持实时协同编辑。本仓库发布其编辑器的源代码：正是 MR Office 所运行的同一批编辑器，你可以自行构建、运行和嵌入。

## 个人和小团队免费使用

- **MR Office 在线版和桌面应用** — 免费：真正的 Word、Excel、PowerPoint 和 PDF 编辑，实时协作和共享，支持网页、手机以及电脑离线使用。AI 附带每日免费额度；更高强度的 AI 使用为可选付费方案。
- **面向自有应用的嵌入版** — 免费起步，功能齐全：完整的公式引擎、真正的 Office 文件、协作编辑、所有导出格式和自动化 API（localhost 上每月 1,000 个会话，自有域名上每月 100 个会话，最多 2 个应用，无需绑卡）。
- **使用量较大的企业** — 在全托管服务上按需付费：Starter 每月 US$29，含 5,000 个会话；Pro 每月 US$149，含 40,000 个会话，支持白标和优先支持。无需年度许可，无需运行服务器，无需管理升级：更新、扩缩容和备份都由我们负责。

作为对比，ONLYOFFICE Docs Developer Edition 的标价约为每年 US$6,000，可在自行运行的服务器上支持 250 个并发连接（经销商标价，2026 年 11 月）；Univer Pro 的价格未公开。 [价格与限额 →](https://mroffice.ai/developers/pricing)

## 在你的文件内部工作的 AI

在 MR Office 中，AI 直接作用于文档本身，而不是粘贴到聊天里的文本。它会读取文件，在文件自身的对象中完成修改，并在你确认之前展示它改动了什么。

- **每个编辑器中都有 Copilot** — 文档、表格、演示文稿、PDF 和代码。选中或圈出你要指的内容，说出你的需求：它会就地编辑段落、表格、单元格和公式、形状和幻灯片，请求不明确时会主动询问，改动落地前先预览，每一步都可撤销。
- **由你审阅的改动** — AI 提出的修改只有在你确认后才会应用；如果文件在此期间发生了变化，该提案即作废，你写的内容不会被覆盖。
- **了解你工作区的 AI 窗口** — 询问你的文件、笔记和画布，获得带来源引用的回答；它能起草新文档、表格和演示文稿，需要时还能在画布上搭建一个小工具。
- **记忆** — 记忆图谱会保存重要的人物、项目和决策，让 AI 不必在每次对话中都从零开始。
- **领先模型** — 每次对话都可以从当今领先的 AI 模型中选择；你的文件保留在你的工作区中，使用桌面应用时则保留在你自己的电脑上。

**[免费试用 MR Office 中的 AI →](https://mroffice.ai)**

### 让你的 AI 智能体编辑 Office 文件（MCP）

Claude、ChatGPT、Cursor、Codex、VS Code 以及任何其他 MCP 客户端，都可以通过 MR Office 的 MCP 服务器创建、打开、编辑、读回、渲染和导出文档与表格（`create_document`、`open_document`、`update_document`、`get_document`、`render_page`、`export_document`，可导出为 docx、xlsx、pptx、pdf、md、html 或 csv）。在支持 MCP Apps 的应用中，编辑器会直接出现在对话里；在其他应用中，工具会返回同一编辑器的链接和页面图片。你和 AI 编辑的是同一个文档：助手会先读回你的修改再继续，若更新基于它尚未看到的修改，则会被拒绝而不是丢失。

```bash
# Claude Code
claude mcp add mroffice -- npx -y mroffice-mcp
# Codex
codex mcp add mroffice -- npx -y mroffice-mcp
```

Claude Desktop、Cursor 及其他接受 JSON 配置的应用：

```json
{ "mcpServers": { "mroffice": { "command": "npx", "args": ["-y", "mroffice-mcp"] } } }
```

无需安装：连接托管端点 `https://mcp.mroffice.ai/mcp`，用你的 MR Office 账户登录即可。Word、Excel 和 PowerPoint 文件会以你自己的账户通过 MR Office 的 Office 引擎处理；MCP 服务器的源代码位于 `apps/mcp`。 [MCP 指南 →](https://mroffice.ai/developers/mcp)

## 开发者

开发者需要的一切都在 **[MR Office Developers](https://mroffice.ai/developers)**——自助开通，无需申请：用任意 MR Office 账号登录即可开始。

### 把编辑器嵌入你的网页应用（推荐）

MR Office 托管编辑器；你的服务器签发短期会话令牌，你的页面即可打开编辑器。它可以编辑真实的 Word、Excel、PowerPoint 和 PDF 文件（.docx、.xlsx、.pptx、.pdf），具备完整的公式引擎、协同编辑、上传、所有导出格式、打印、自动化 API（文档对象模型、宏、插件），并通过签名回调将保存内容发送回你的服务器。所有这些都包含在 Free 计划中：localhost 上每月 1,000 个会话，你自己的域名上 100 个，最多 2 个应用，无需信用卡。作为托管服务，它不会对你的应用施加任何 AGPL 义务。

1. 在你的项目文件夹里运行 `npx mroffice-embed init`（或在开发者控制台创建应用）：在浏览器里点一次“允许”，应用的密钥就写入 `.env.local` / `.env`。
2. 你的服务器用 `mroffice-embed/server` 的 `createSessionToken` 签发会话令牌；密钥始终只在服务器上。
3. 你的页面用 `mroffice-embed` 的 `open()` 打开编辑器（或用脚本 `https://mroffice.ai/embed/v1/embed.js`）。

```js
// server: GET /api/mroffice/session (check who is signed in first)
import { createSessionToken } from "mroffice-embed/server";
const token = await createSessionToken({
  appId: process.env.MROFFICE_APP_ID,
  secretKey: process.env.MROFFICE_SECRET_KEY, // mro_sk_..., server only
  file: { key: "contract-42", name: "contract.docx", url: signedUrlToTheFile },
  user: { id: user.id, name: user.name },
  mode: "edit",
});

// page
import { open } from "mroffice-embed";
open({ container: "#editor", token: () => fetch("/api/mroffice/session").then((r) => r.json()).then((b) => b.token) });
```

[嵌入指南](https://mroffice.ai/developers/embed) · [Markdown 版指南（给 AI 编程助手）](https://mroffice.ai/developers/embed.md) · [价格与限额](https://mroffice.ai/developers/pricing) · [开发者控制台](https://mroffice.ai/developers/console) · [在线演示](https://mroffice.ai/developers/embed/demo)

### AI 应用：MCP 服务器

上述 MCP 服务器也是你自己的 AI 功能在真实 MR Office 编辑器中打开、读取、编辑和导出文档的方式：使用托管端点 `https://mcp.mroffice.ai/mcp`（OAuth 登录，无需密钥），或在你自己的电脑上运行 `npx -y mroffice-mcp`。 [MCP 指南 →](https://mroffice.ai/developers/mcp)

### 用 MR Office 账号登录（OAuth）

MR Office 是一个 OAuth 2.1 授权服务器（PKCE、客户端 ID 元数据文档、动态注册）：你的应用可以让用户用 MR Office 账号登录，并在其允许的权限范围内操作。 [OAuth 指南 →](https://mroffice.ai/developers/oauth)

### 自行部署开源编辑器

本仓库中的五个编辑器可在 AGPL-3.0 下构建到你自己的产品中：如果人们通过网络使用修改版本，你必须向他们提供其完整源代码，并保留“MR Office”署名（NOTICE.md）。它们可打开自有格式、CSV、HTML、Markdown 和 PDF；Word、Excel 和 PowerPoint 文件随上述托管嵌入提供，包含免费计划。商业许可证可从 support@mr-note.com 获取。 [开源指南 →](https://mroffice.ai/developers/open-source)

这些编辑器以 React 组件形式发布在 npm 上：`npm i mroffice-docs mroffice-core`（以及 `mroffice-sheets`、`mroffice-slides`、`mroffice-pdf`、`mroffice-code`）；每个包的 README 展示了如何嵌入它。

## 编辑器一览

各编辑器在本仓库中能做的事：

- **文档** — 分页文字处理器：在“开始”选项卡中提供字体、段落格式、列表和样式；在“插入”选项卡中提供封面和空白页、分页符、表格、图片、形状、SmartArt、图表、链接、书签、批注、页眉、页脚和页码、公式、符号、文本框和 艺术字。保存自有格式（.mrdoc）；可打开 HTML、Markdown 和纯文本。
- **表格** — 在“开始”选项卡中，可对单元格和公式设置字体、对齐方式、数字格式、条件格式、单元格样式，以及插入或删除单元格；在“插入”选项卡中，可添加表格、图片、形状、图标、复选框、图表和迷你图；支持多个工作表，并可对所选区域求和与求平均值。单元格间的算术运算（=A1*B1+10）在浏览器中键入时实时计算，文件中的每个公式都完整保留；完整的公式引擎（SUM、IF、VLOOKUP 及数百个函数）在 MR Office 桌面应用和托管嵌入的免费计划中免费运行。保存自有格式（.mrsheet）；可打开和保存 CSV 与 TSV。
- **演示文稿** — 幻灯片，在“开始”选项卡中提供版式和节、文本、字体和段落，以及形状及其排列；在“插入”选项卡中提供表格、图片、图标、SmartArt、图表、文本框、艺术字、页眉和页脚、公式、符号和视频；支持演讲者备注、批注和演示。保存自有格式（.mrslides）。
- **PDF** — 阅读、演示和打印 PDF 文件：单页和双页视图、连续滚动、旋转、缩略图和阅读模式、搜索和复制文本，以及批注；编辑 PDF 自身文本并保存回文件，在 MR Office 桌面应用和托管嵌入中免费。
- **代码** — 快速的代码编辑器，支持多种语言的语法高亮、大纲、查找、快速打开、文件资源管理器和问题列表。

带函数的公式（SUM、IF、VLOOKUP 及数百个函数）、Word、Excel 和 PowerPoint 文件、图表、SmartArt 和自动化 API 均可免费使用：在免费的 MR Office 桌面应用中，以及通过托管嵌入的免费计划在你自己的应用中。开源编辑器中的文件也完整保留每个公式、图表和 SmartArt。

## 运行编辑器

**▶ [在线试用，无需安装](https://mroffice.ai)**

五个编辑器位于 `packages/`（`@mrnote/docs`、`sheets`、`slides`、`pdf`、`code`，共享 `@mrnote/core`），并在 `apps/playground` 中一起运行：

```bash
npm install
npm run fonts     # the open substitutes for Office's fonts
npm run build
npm run preview   # http://localhost:5178
```

`npm run dev` 在同一地址启动开发服务器，`npm run smoke` 检查构建结果。各包的 README 详细列出了它能做的事和嵌入方法。

## 桌面应用

[`apps/desktop`](../apps/desktop) 包含 **MR Office Editors**：MR Office 桌面应用外壳（Electron）的源码，拥有独立的身份标识。配合 Releases 中免费的 MR Office 组件，它就是 MR Office 桌面应用，支持 Word、Excel、PowerPoint 和 PDF 文件、登录和 AI。不配合该组件时，它单独运行开源编辑器，可打开 .mrdoc、.mrsheet 和 .mrslides 文件、CSV、HTML、Markdown 和 PDF。外壳和编辑器均为 AGPL 源代码；组件可从 Releases 免费下载。执行 `npm run build` 后，用以下命令启动：

```bash
npm run desktop
```

## 完整功能请安装 MR Office 桌面版（免费）

MR Office 桌面应用免费，包含这些编辑器和完整服务，可在你自己的电脑上离线工作。它还带来：

- 打开和保存 Word、Excel、PowerPoint 文件（.docx、.xlsx、.pptx）
- 带函数的公式（SUM、IF、VLOOKUP …），由完整的公式引擎计算
- 根据你的数据计算并绘制的图表
- SmartArt 编辑
- PDF 编辑后写回文件
- 自动化 API：文档对象模型、宏和插件

**[下载 MR Office（免费） →](https://mroffice.ai/office/download)**

## 各部分的关系

```mermaid
flowchart LR
  subgraph OSS["开源 · AGPL-3.0"]
    direction LR
    core["@mrnote/core"] --> E["五个编辑器<br/>文档 · 表格 · 演示文稿 · PDF · 代码"]
    E --> PG["apps/playground<br/>浏览器"]
    E --> DS["apps/desktop<br/>桌面外壳"]
    MCP["apps/mcp<br/>给 AI 应用的 MCP 服务器"]
  end
  COMP["MR Office 组件：Word、Excel 和 PowerPoint 文件 · 免费"] -.-> DS
```

## 许可协议

依据 GNU Affero 通用公共许可证 v3.0（LICENSE）开源，并附加 NOTICE.md 中的条款：保留“MR Office”署名及指向 https://mroffice.ai 的链接，且不授予 MR Office 名称与标志的使用权。如需商业授权，请联系 support@mr-note.com。第三方软件与数据见 THIRD_PARTY_NOTICES.md。贡献代码请先阅读 CONTRIBUTING.md。

## 更多

官网与完整产品：**https://mroffice.ai** · 问题与反馈：support@mr-note.com

<p align="center">如果 MR Office 对你有用，在 GitHub 上点个 ⭐，能让更多人发现它。</p>
