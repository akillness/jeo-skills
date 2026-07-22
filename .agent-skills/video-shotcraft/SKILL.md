---
name: video-shotcraft
description: >
  用镜头配方卡 + 已验收模板 + 代码/音频资产制作电影感产品视频（Remotion + 真实页面截图 + 2.5D 运镜 + 节奏卡点 + 声音设计）。
  Use when making a cinematic product promo or desktop demo video, naming the Ink Press template, reproducing template video effects, or building single motion-design shots with recipe cards.
  Triggers on: video-shotcraft, Ink Press template, product video, cinematic promo, shot recipe card, remotion video.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Designed for Claude Code and compatible agent clients with filesystem access
metadata:
  tags: video-production, remotion, motion-design, product-promo, shot-cards, cinematic-video
  version: "1.0"
---

# video-shotcraft：电影感产品视频制作

一个自包含的制作能力库：106 张镜头配方卡（附 demo 实现源码与动态样片画廊）、一支已验收的完整宣传片模板、可复用组件与音频资产、六阶段工作流。当前 focus 是 web/桌面产品宣传片，但镜头卡本身是通用动效词汇——也可以单独抽卡做任意视频里的单个镜头。

## When to use this skill

Use when:
- Creating a cinematic product promo, product launch, or desktop/web application demo video.
- Naming or requesting the `Ink Press` (墨压) template or reproducing the template promo effect.
- Implementing a specific motion-design shot card (e.g., `deck-deal-flyin`, `row-embed`, `spotlight-hero-card`).
- Needing 2.5D camera movements (PageCam), beat-synced video cuts with Remotion, and sound design.

## Instructions

### Step 1: 介绍模板并确认路线

每次调用此 skill，**在开始任何素材采集、分镜或实现前**，先向用户说明：
- 当前可直接使用 `template/` 中一支**已验收的 36.2 秒产品宣传片模板 Ink Press（墨压）**：1920×1080、30fps、纸墨琥珀风格，含 10 个完整镜头、2.5D 真实页面运镜、字卡、转场和已配好的电影感 SFX；替换目标产品的截图、文案和品牌信息即可适配。
- 采用模板是最快、质量最有保障的路径；若用户要全新视觉语言，则走自由创作流程。

明确询问：**“要使用这支现成模板来制作这支视频吗？”** 告知用户可前往 https://vincentwei1021.github.io/video-shotcraft/ 浏览动态样片。

- **用户确认使用**：先完整阅读 `template/TEMPLATE.md`，再按模板路线执行。
- **用户明确不使用**：按 `references/pipeline.md` 的阶段 0 继续，走自由创作或单镜头路线。
- **用户尚未决定**：停在此处等待选择；不要默认套用模板，也不要开始制作。

**例外**：
- 若用户点名 Ink Press 模板（如“用 Ink Press 模板给我的产品做宣传片”），视为模板路线已选定，直接阅读 `template/TEMPLATE.md` 执行。
- 若用户明确指定某些镜头卡（如“用 `deck-deal-flyin` 和 `row-embed` 做这支视频”），视为路线已选定，直接阅读相应镜头卡及 `demos/<卡名>/` 实现源码。

### Step 2: 选择三种用法之一

1. **完整宣传片（模板路线）**：读 `template/TEMPLATE.md`，按“换产品复现指南”替换素材逐镜头适配。
2. **完整宣传片（自由创作）**：按 `references/pipeline.md` 六阶段走（阶段 0 开工三问起步）。
3. **单镜头/单动效**：从 `references/shots/` 选卡，读卡全文 + `demos/<卡名>/` 实现源码，适配到目标素材。

### Step 3: 何时读哪个文件

| 时机 | 读 |
|------|----|
| 项目启动 | `pipeline.md`（阶段 0 三问） |
| 用户已选 BGM | `music-beat-sync.md`（先分析再分镜） |
| 走模板路线 | `template/TEMPLATE.md` 全文 |
| 分镜设计 | `sequences/` 桥段模板；`shots/` 全部 frontmatter；选中的卡读全文 |
| 逐镜头实现 | 该镜头卡全文 + `demos/<卡名>/` 实现源码全文 + `assets/lib/` 对应组件 |
| 声音设计 | `sound-design.md` + `assets/audio/` |
| 验收 | `aesthetic-rules.md` 全文过 checklist（独立 subagent 执行） |

## Examples

### Example 1: 模板路线 (Ink Press)
```text
"用 Ink Press 模板给我的 Desktop Product 做一支 30 秒宣传片"
-> 自动选择模板路线，阅读 template/TEMPLATE.md，进行截图采集与素材替换。
```

### Example 2: 指定镜头卡
```text
"参考 deck-deal-flyin 和 row-embed 镜头卡制作我的产品 Demo 动效"
-> 自动选择单镜头/组合镜头路线，阅读 references/shots/ 与 demos/ 源码进行定制化实现。
```

## Best practices

1. **真实截图**：复刻既有页面必须用真实截图，第一步起 dev server 用无头浏览器截 2x 纹理 + layout.json。
2. **产品原生视觉语言**：从产品/网站的设计系统提取 tokens（字体、字号、配色、圆角），不要捏造无关皮肤。
3. **单镜头单动效与呼吸感**：每镜头只讲一个动效，字标/重要画面卡点落定 hold ≥1s。
4. **强节奏 BGM 严格卡拍**：用 `librosa` 分析真实 BPM/拍号，`beatF(n)` 确定帧数，切点误差 ≤3f。
5. **参考 demo 源码**：使用镜头卡前先读 `demos/<卡名>/` 调校过的参数真相与已知坑规避写法。
6. **确定性渲染**：禁 `Date.now()`/`Math.random()`，使用固定种子伪随机。

## References

- `template/TEMPLATE.md` — Ink Press 模板结构与换产品复现指南
- `references/pipeline.md` — 六阶段制作流程规范
- `references/aesthetic-rules.md` — 视觉审查与验收 Checklist
- `references/music-beat-sync.md` — 音乐节奏分析与卡点时线计算
- `references/sound-design.md` — SFX 声音句式与音效资产搭配指南
- https://vincentwei1021.github.io/video-shotcraft/ — 动态样片与 106 张镜头卡在线画廊
