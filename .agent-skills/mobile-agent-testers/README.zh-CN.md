# mobile-agent-testers

<a href="https://www.producthunt.com/posts/mobile-agent-testers?utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=mobile-agent-testers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=dark"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=light" alt="Mobile Agent Testers on Product Hunt" width="250" height="54"></picture></a>
<a href="https://www.linkedin.com/in/pierre-raffalli/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/linkedin-follow-dark.svg"><img src="assets/linkedin-follow-light.svg" alt="Follow Pierre Raffalli on LinkedIn" width="160" height="54"></picture></a>

**20 个 AI 测试员，20 台不同的手机，在 GitHub 的免费运行器上并行测试。**

**[应用实例](docs/examples.zh-CN.md)** · **[对比](docs/compare.md)** · **[常见问题](#常见问题)** · **[角色](personas.json)** · **[版本](https://github.com/pierridotite/mobile-agent-testers/releases)**

[English](README.md) · 简体中文 · [日本語](README.ja.md) · [Español](README.es.md) · [Português](README.pt-BR.md)

<sub>本页译自英文版，可能稍有滞后，以 [README.md](README.md) 为准。</sub>

无需编写测试脚本。每个测试员都是一个 Claude Code 智能体，在 GitHub Actions 上拥有自己的 iOS
模拟器或 Android 模拟器。它扮演一个角色（瑞典语、最大字号的 iPhone SE，字体 200% 的 Pixel 7，
德语 iPad，从右到左的阿拉伯语……），像新用户一样使用你的应用（或者按你的要求测某个功能），并写出带截图的缺陷报告。
支持 Flutter、React Native、Expo、原生 Kotlin 和 Swift、Kotlin Multiplatform、Capacitor 和 .NET MAUI。

公开仓库使用 GitHub 的运行器是免费的。你只需要为模型付费，用你的 Claude 订阅或 API key：
在[这几次运行](docs/runs/)中，每台手机大约 0.15 到 0.55 美元。

<p align="center"><a href="assets/localsend-20.mp4"><img src="assets/localsend-20.gif" alt="20 个 AI 测试员同时使用 LocalSend 的真实录屏：10 台 Android 模拟器和 10 台 iOS 模拟器，14 种语言，从小屏 Pixel 到 13 英寸 iPad。测试员完成后，手机上会显示它发现的问题数量。点击打开视频。" width="100%"></a><br>
<sub>LocalSend 那次运行的真实录屏，已剪掉空闲时间。<a href="assets/localsend-20.mp4">完整视频（MP4）</a> · <a href="docs/runs/localsend-20.md">逐台设备查看这次运行</a></sub></p>

[![Tests](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml/badge.svg)](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/pierridotite/mobile-agent-testers?style=flat)](https://github.com/pierridotite/mobile-agent-testers/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![iOS + Android](https://img.shields.io/badge/platforms-iOS%20%2B%20Android-blue)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)
[![Last commit](https://img.shields.io/github/last-commit/pierridotite/mobile-agent-testers)](https://github.com/pierridotite/mobile-agent-testers/commits/main)

## 能做什么

每次运行一种用法，用[测试你自己的应用](#测试你自己的应用)里的参数来设置。

- **像新用户一样探索**（默认）。每个角色都会努力完成自己的目标，并报告一路上遇到的障碍，附带编号截图。
- **把一个功能从头测到尾。** 用你自己的 brief 让每个智能体完整走一遍某个机制：分几步的预订、带撤销的编辑器、两个页面之间的同步。智能体会点按、长按、滑动和输入，离开应用再回来，重启应用检查保存了什么，或者打开深层链接直接进入这个功能；brief 还可以提高默认约 30 步操作的预算。[AnkiDroid 的 brief](briefs/ankidroid.md) 就发现新卡片的背面输入框被键盘挡住了。
- **在每台手机上复现一个缺陷报告**：给出一个 issue 或复现步骤，每个智能体回答“是 / 否 / 不确定”，并附上截图（[briefs/reproduce.md](briefs/reproduce.md)）。
- **生成改进报告。** 每个角色把应用用一遍，然后说出在哪里犹豫、原本期待什么、最该先改什么，并标出领域和影响（[briefs/improve.md](briefs/improve.md)）。
- **对比两个版本。** 同一批角色分别使用两个分支或构建，最后得到一张表：目标是否达成、操作次数、评分、只在一个版本出现的问题（[docs/compare-versions.md](docs/compare-versions.md)）。适合在真正的 A/B 测试之前做检查，但不能代替 A/B 测试。
- **使用更便宜的模型**：Claude Haiku，或任何兼容 Anthropic 接口的 API（OpenRouter、DeepSeek、Kimi、GLM、MiniMax、通义千问）。发现的质量取决于模型读截图的能力和推理能力（[docs/cheaper-models.md](docs/cheaper-models.md)）。

## 应用实例

在开源应用上的真实运行，没有预先埋入任何缺陷。

| 应用 | 手机 | 智能体发现了什么 | 用时、模型用量 |
|---|---|---|---|
| [LocalSend](https://github.com/localsend/localsend)（Flutter，10 万星） | 20 台：10 台 Android、10 台 iOS，14 种语言 | 46 个不同的缺陷，其中 1 个阻断级：瑞典语、最大字号的 iPhone SE 上根本无法发送文字消息 | 69 分钟，4.62 美元 |
| [AnkiDroid](https://github.com/ankidroid/Anki-Android)（Kotlin，1.2 万星，发布版 APK） | 10 台 Android | 43 个不同的问题，比如字体 200% 时答题按钮被切掉一半，三种语言里“Get started”仍是英文 | 不到 10 分钟，4.69 美元 |
| [Flutter 官方动画示例](https://github.com/flutter/packages/tree/main/packages/animations/example) | 1 台 Android、1 台 iOS | 两个智能体各自报告了同一个拼写错误，还发现应用不支持深色模式 | 19 分钟，0.47 美元 |

在 LocalSend 上，46 个缺陷中有 34 个与字号和无障碍都无关：流程中断、静默失败、缺失的翻译、平板布局。截图、每个发现以及重新运行的命令：[docs/examples.zh-CN.md](docs/examples.zh-CN.md)。

## 快速开始

```bash
gh repo create my-testers --public --template pierridotite/mobile-agent-testers --clone
cd my-testers && ./setup.sh           # 密钥对 + secrets + Claude 令牌（Windows：.\setup.ps1）
gh workflow run agent-testers.yml     # 演示：2 个 Android + 2 个 iOS 测试员，约 20 分钟
bash scripts/collect.sh <run id>      # 解密报告并归并重复项：runs/<id>/SUMMARY.md
```

演示应用里有 [11 个故意埋下的缺陷](demo-app/BUGS.md)。在[一次运行](docs/runs/)中，4 个演示测试员找到了其中 9 个（每个智能体 2 到 7 分钟，整次运行约 21 分钟，含构建），还发现了没人埋下的真实问题（一个按钮被 Android 导航栏挡住、重新启动后数据没有保留）。模型用量：4 个共 0.87 美元。

或者让 Claude 为你的应用完成设置：

```
/plugin marketplace add pierridotite/mobile-agent-testers
/plugin install mobile-agent-testers@mobile-agent-testers
```

## 为什么不用 Maestro、Appium 或 agent-device？

它们运行你写好的测试。这些智能体寻找没人想到要测的东西。

| | mobile-agent-testers | Maestro、Appium、Detox、e2e |
|---|---|---|
| 你要写的 | 什么都不用：从列表里选角色 | 流程或测试代码 |
| 能发现 | 中断的流程、静默的错误、漏翻的文字、大字号下的布局、深色模式、令人困惑的文案 | 每个测试所检查的内容 |
| 每次结果相同 | 否：每次都在探索，所以请查看截图 | 是 |

[agent-device](https://github.com/callstackincubator/agent-device) 让一个编程智能体操作一台模拟器。本项目运行完整的测试会话：构建应用，给每个角色分配自己的设备，并收集加密的报告。发布前用智能体，回归测试用脚本化流程。

完整对比，包括 Firebase Test Lab Robo、mobile-mcp、phonedriver 和真人 Beta 测试员：[docs/compare.md](docs/compare.md)（英文）。

## 测试你自己的应用

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

| 输入 | |
|---|---|
| `source_repo`, `ref` | 应用仓库和分支（留空 = 本仓库）。私有仓库：添加一个只读的 `SOURCE_REPO_TOKEN` secret |
| `app_dir`, `app_id` | 应用目录，Android 包名 / iOS bundle id（如果另一个平台用的是别的 id，会从它的构建产物中读取） |
| `android_personas`, `ios_personas` | [personas.json](personas.json) 中的 id，每个角色一台手机；`all` 表示全部，`none` 表示跳过该平台。内置 20 个角色：14 种语言、从右到左、平板、从小号到最大辅助功能字号 |
| `brief` | 给智能体的说明：[AGENT_BRIEF.md](AGENT_BRIEF.md) 用于探索，[briefs/improve.md](briefs/improve.md) 用于改进报告，也可以用你自己写的来测某个功能 |
| `bug_report` | 要复现的缺陷，而不是自由探索：一个 issue（`owner/repo#123` 或它的链接），或者直接写步骤。每个智能体在自己的设备上照着做（[briefs/reproduce.md](briefs/reproduce.md)） |
| `model`、`llm_base_url` | 默认 `sonnet`，想省钱用 `haiku`，也可以用任何兼容 Anthropic 接口的 API，密钥放在 `LLM_API_KEY` secret 里（[docs/cheaper-models.md](docs/cheaper-models.md)） |
| `framework` | `auto`（默认），或强制使用下表中的某个框架 |
| `android_build` + `apk_path`, `ios_build` + `ios_app_path` | 你自己的构建命令，或下载一个预构建的应用（路径相对于 `app_dir`） |
| `block_hosts` | 测试期间屏蔽的统计分析域名 |
| `record_video` | 每台手机的录屏，与报告一起加密 |

**开箱即用**（自动检测）：

| 框架 | Android | iOS 模拟器 |
|---|---|---|
| Flutter | `flutter build apk --debug` | `flutter build ios --simulator` |
| React Native / Expo | Gradle release | Xcode, arm64 |
| 原生 Kotlin / Java、Swift / Objective-C | Gradle debug | Xcode, arm64 |
| Kotlin Multiplatform | Gradle debug | iOS 应用的 Xcode 工程 |
| Capacitor / Ionic | `cap sync` 后 Gradle debug | `cap sync` 后 Xcode |
| .NET MAUI（测试版） | `dotnet publish` | 针对 `iossimulator-arm64` 的 `dotnet build` |
| 其他任何框架 | `android_build` + `apk_path` | `ios_build` + `ios_app_path` |

智能体通过截图和无障碍树读取屏幕，所以任何 UI 工具包都适用。带标签的控件（Flutter `Semantics`、`contentDescription`、`accessibilityLabel`）能让它们点得更准。

## 工作原理

<p align="center"><img src="assets/how-it-works.svg" alt="工作原理：一个工作流构建应用，然后每个角色一台模拟器和一个智能体，报告加密，汇总在你的电脑上生成" width="100%"></p>

- **角色**决定设备：型号、系统版本、字号、深色模式、语言、位置。
- **每个智能体三个工具**：查看屏幕（带点击坐标）、手势、输入文字。
- **每个屏幕都做无障碍检查**：没有名称的控件，以及小于 48 dp（Android）或 44 pt（iOS）的触控目标，由智能体在截图上确认。
- **结果加密**：公开仓库的日志是公开的，所以一切都用你的密钥加密。
- **手机内屏蔽统计分析**，测试不会碰到你的真实数据。
- **在你的电脑上生成一份汇总**：Claude 把描述同一缺陷的报告归并起来，你能看到每个缺陷被多少个角色遇到，以及哪些角色发现了哪类问题。
- **每次推送都会测试**，离线、无需手机：无障碍检查、角色矩阵、汇总、加密结果（[tests/](tests/)）。

## 限制

- 公开仓库的 GitHub runner 免费：同时约 20 个任务，其中 macOS 5 个。
- 对于有 5 小时用量上限的套餐，20 个智能体大约 15 分钟就能用完：每批运行 6 到 10 个。
- 托管 runner 应该用于仓库自身的项目。闭源应用请在你的私有仓库或自己的 Mac 上运行这个工作流。

## 常见问题

### 20 个智能体会不会把同一个缺陷找 20 遍？

不会。在 LocalSend 上，103 份报告对应 46 个不同的缺陷，其中 29 个只被一个智能体发现，包括唯一的阻断级缺陷（[见这次运行](docs/runs/localsend-20.md)）。从右到左的缺陷只来自两个阿拉伯语角色，平板的缺陷只来自四台平板。重复的都是人人都会遇到的全局状态，比如空的设备列表。

### 要花多少钱？

公开仓库的 GitHub runner 免费，包括 macOS。在[这些运行](docs/runs/)中，每个智能体的模型用量为 0.15 到 0.55 美元，20 台手机大约 5 美元。如果使用 Claude 订阅，运行会计入你套餐的用量，不会另外收费。想省钱，可以用 `model=haiku` 或其他服务商的模型：见 [docs/cheaper-models.md](docs/cheaper-models.md)。

### 一次运行要多久？

每个智能体探索 1 到 18 分钟。AnkiDroid 的 10 个 Android 智能体从开始到最后一份报告不到 10 分钟。LocalSend 的 20 台设备用了 69 分钟（含构建），因为免费计划同时只能运行 5 个 macOS 任务。

### 需要 Mac 吗？

不需要。一切都在 GitHub 的 runner 上运行：Android 用 Linux，iOS 用 macOS。你只需要 `gh` 命令行工具，以及 Claude 订阅或 API 密钥，其余的交给 `./setup.sh`（Windows 上是 `.\setup.ps1`）。

### 两次运行的结果会一样吗？

不会。每个智能体都在探索，两次运行不会走同一条路：会发现同类的缺陷，但不是同一份清单。回归测试请继续使用脚本化测试（Maestro、Appium），参见[对比](docs/compare.md)。

### 我的报告是公开的吗？

不是。公开仓库的日志是公开的，所以报告、截图和视频在离开 runner 之前就已用你的密钥加密，只有你能解密。手机内会屏蔽统计分析域名。请使用测试账号，不要用真实账号。详见 [PRIVACY.md](PRIVACY.md)。

### 可以测试闭源应用吗？

可以。在私有仓库中运行这个工作流，用只读的 `SOURCE_REPO_TOKEN` 访问你的应用仓库，或者让 `android_build` 和 `ios_build` 下载预构建的 APK 或 .app。私有仓库会消耗你的 Actions 分钟数，macOS 的分钟按十倍计算。

### 可以自己定义角色吗？

可以。一个角色就是 [personas.json](personas.json) 里的几行：设备、系统版本、语言、字号、深色模式、位置、这个人是谁，以及想做什么。

### 它会出什么错？

它有时会看错屏幕：LocalSend 的 20 个智能体中有 3 个把模拟器的英文键盘当成了应用的一部分。每个智能体只探索几分钟，覆盖主要路径，而不是大型应用的每个角落。每个发现都附带编号截图，提交之前请先核对。

## 团队托管版（探索中）

这里的工作流会一直免费、开源、完整。我正在探索一个面向私有应用团队的托管版：包含 macOS 运行器（在私有仓库里，GitHub 把 macOS 的每一分钟按十分钟计算），以及一个网页面板，方便把报告分享给整个团队，包括产品经理。

对你的团队有用吗？[回答三个问题](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=teams.yml)，或[在 LinkedIn 上联系我](https://www.linkedin.com/in/pierre-raffalli/)。已经在你的应用上跑过了？[告诉我它发现了什么、哪里卡住了](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml)。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=pierridotite/mobile-agent-testers&type=Date)](https://star-history.com/#pierridotite/mobile-agent-testers&Date)

## 致谢

[Claude Code](https://docs.claude.com/en/docs/claude-code) ·
[AXe](https://github.com/cameroncooke/axe) ·
[android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)

由 [@pierridotite](https://github.com/pierridotite) 制作（[LinkedIn](https://www.linkedin.com/in/pierre-raffalli/)）· MIT 许可证
