# mobile-agent-testers

<a href="https://www.producthunt.com/posts/mobile-agent-testers?utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=mobile-agent-testers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=dark"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=light" alt="Mobile Agent Testers on Product Hunt" width="250" height="54"></picture></a>
<a href="https://www.linkedin.com/in/pierre-raffalli/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/linkedin-follow-dark.svg"><img src="assets/linkedin-follow-light.svg" alt="Follow Pierre Raffalli on LinkedIn" width="160" height="54"></picture></a>

**20 人の AI テスターが、20 台の異なるスマートフォンで、GitHub の無料ランナー上で同時にテスト。**

**[適用例](docs/examples.ja.md)** · **[比較](docs/compare.md)** · **[よくある質問](#よくある質問)** · **[ペルソナ](personas.json)** · **[リリース](https://github.com/pierridotite/mobile-agent-testers/releases)**

[English](README.md) · [简体中文](README.zh-CN.md) · 日本語 · [Español](README.es.md) · [Português](README.pt-BR.md)

<sub>このページは英語版の翻訳です。更新が遅れることがあるため、最新の内容は [README.md](README.md) をご覧ください。</sub>

テストスクリプトを書く必要はありません。各テスターは Claude Code のエージェントで、GitHub Actions 上に
自分専用の iOS シミュレーターまたは Android エミュレーターを持ちます。ペルソナ（スウェーデン語で文字サイズ最大の
iPhone SE、フォント 200% の Pixel 7、ドイツ語の iPad、右から左に読むアラビア語……）を演じ、新しいユーザーとして
アプリを使い（または指定した機能を試し）、スクリーンショット付きのバグレポートを書きます。Flutter、React Native、Expo、ネイティブの Kotlin と
Swift、Kotlin Multiplatform、Capacitor、.NET MAUI に対応しています。

公開リポジトリなら GitHub のランナーは無料です。費用はモデルの利用料だけで、Claude のサブスクリプションか
API キーを使います。[これまでの実行](docs/runs/)では 1 台あたり約 0.15〜0.55 ドルでした。

<p align="center"><a href="assets/localsend-20.mp4"><img src="assets/localsend-20.gif" alt="20 人の AI テスターが同時に LocalSend を使う実際の画面録画：Android エミュレーター 10 台と iOS シミュレーター 10 台、14 言語、小さな Pixel から 13 インチの iPad まで。テスターが終わると、その端末に見つけた問題の数が表示されます。クリックで動画を開きます。" width="100%"></a><br>
<sub>LocalSend での実行の実際の画面録画（待ち時間はカット）。<a href="assets/localsend-20.mp4">動画全体（MP4）</a> · <a href="docs/runs/localsend-20.md">端末ごとの実行記録</a></sub></p>

[![Tests](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml/badge.svg)](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/pierridotite/mobile-agent-testers?style=flat)](https://github.com/pierridotite/mobile-agent-testers/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![iOS + Android](https://img.shields.io/badge/platforms-iOS%20%2B%20Android-blue)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)
[![Last commit](https://img.shields.io/github/last-commit/pierridotite/mobile-agent-testers)](https://github.com/pierridotite/mobile-agent-testers/commits/main)

## できること

1 回の実行で 1 つの使い方です。設定は[自分のアプリをテストする](#自分のアプリをテストする)の入力で行います。

- **新しいユーザーとして探索**（デフォルト）。各ペルソナが自分の目標を達成しようとし、妨げになったことを番号付きのスクリーンショットとともに報告します。
- **1 つの機能を最初から最後まで試す。** 自分で書いた brief で、各エージェントに 1 つの仕組みを通しで試させます。複数ステップの予約、元に戻せるエディター、2 つの画面間の同期などです。エージェントはタップ、長押し、スワイプ、入力ができ、アプリを離れて戻ったり、再起動して保存内容を確かめたり、ディープリンクで目的の機能から直接始めたりします。brief では約 30 操作という上限を増やすこともできます。[AnkiDroid 用の brief](briefs/ankidroid.md) では、新しいカードの裏面の入力欄がキーボードに隠れることが見つかりました。
- **バグ報告をすべての端末で再現**：issue か手順を渡すと、各エージェントが「再現した / しなかった / はっきりしない」をスクリーンショット付きで答えます（[briefs/reproduce.md](briefs/reproduce.md)）。
- **改善レポートを作る。** 各ペルソナがアプリを一度使い、どこで迷ったか、何を期待していたか、まず何を変えるべきかを、領域と影響度つきで挙げます（[briefs/improve.md](briefs/improve.md)）。
- **2 つのバージョンを比較する。** 同じペルソナで 2 つのブランチやビルドを試し、目標の達成、操作数、スコア、片方のバージョンだけで見つかった問題を 1 つの表にまとめます（[docs/compare-versions.md](docs/compare-versions.md)）。本物の A/B テストの前のチェックであり、その代わりにはなりません。
- **安いモデルを使う**：Claude Haiku、または Anthropic 互換の API（OpenRouter、DeepSeek、Kimi、GLM、MiniMax、Qwen）。見つかるものの質は、モデルがスクリーンショットをどれだけ正しく読めるかと推論力で決まります（[docs/cheaper-models.md](docs/cheaper-models.md)）。

## 適用例

オープンソースのアプリでの実際の実行です。仕込んだバグはありません。

| アプリ | 端末 | エージェントが見つけたもの | 時間、モデル使用量 |
|---|---|---|---|
| [LocalSend](https://github.com/localsend/localsend)（Flutter、スター数 10 万） | 20 台：Android 10 台、iOS 10 台、14 言語 | 異なるバグ 46 件、うちブロッカー 1 件：スウェーデン語で文字サイズ最大の iPhone SE では、テキストメッセージを一切送れない | 69 分、4.62 ドル |
| [AnkiDroid](https://github.com/ankidroid/Anki-Android)（Kotlin、スター数 1.2 万、リリース版 APK） | Android 10 台 | 異なる問題 43 件。フォント 200% で回答ボタンが半分に切れる、3 つの言語で「Get started」が英語のまま、など | 10 分未満、4.69 ドル |
| [Flutter 公式のアニメーションサンプル](https://github.com/flutter/packages/tree/main/packages/animations/example) | Android 1 台、iOS 1 台 | 2 つのエージェントがそれぞれ同じタイプミスを報告。アプリはダークモードにも対応していない | 19 分、0.47 ドル |

LocalSend では、46 件のバグのうち 34 件が文字サイズともアクセシビリティとも無関係でした：途中で止まる流れ、黙って失敗する操作、抜けている翻訳、崩れたタブレットのレイアウト。スクリーンショット、すべての指摘、もう一度実行するためのコマンド：[docs/examples.ja.md](docs/examples.ja.md)。

## クイックスタート

```bash
gh repo create my-testers --public --template pierridotite/mobile-agent-testers --clone
cd my-testers && ./setup.sh           # 鍵ペア + シークレット + Claude トークン（Windows：.\setup.ps1）
gh workflow run agent-testers.yml     # デモ：Android 2 + iOS 2 のテスター、約 20 分
bash scripts/collect.sh <run id>      # レポートを復号して重複をまとめる：runs/<id>/SUMMARY.md
```

デモアプリには[わざと仕込んだバグが 11 個](demo-app/BUGS.md)あります。[ある実行](docs/runs/)では、4 人のデモテスターがそのうち 9 個を見つけ（エージェントごとに 2〜7 分、ビルドを含めて全体で約 21 分）、さらに誰も仕込んでいない本物の問題（Android のナビゲーションバーの下に隠れたボタン、再起動するとデータが残っていない）も見つけました。モデル使用量：4 人で 0.87 ドル。

または、Claude にあなたのアプリ用のセットアップを任せることもできます：

```
/plugin marketplace add pierridotite/mobile-agent-testers
/plugin install mobile-agent-testers@mobile-agent-testers
```

## Maestro、Appium、agent-device ではだめなの？

それらはあなたが書いたテストを実行します。このエージェントたちは、誰もテストしようと思わなかったところを探します。

| | mobile-agent-testers | Maestro、Appium、Detox、e2e |
|---|---|---|
| 書くもの | なし：一覧からペルソナを選ぶだけ | フローやテストコード |
| 見つけるもの | 途切れるフロー、黙った失敗、翻訳漏れ、大きな文字でのレイアウト、ダークモード、わかりにくい文言 | 各テストが確認する内容 |
| 毎回同じ結果か | いいえ：毎回探索するので、スクリーンショットを確認してください | はい |

[agent-device](https://github.com/callstackincubator/agent-device) は、1 つのコーディングエージェントに 1 台のシミュレーターを操作させます。こちらはテストのセッション全体を実行します：アプリをビルドし、ペルソナごとに専用の端末を用意し、暗号化されたレポートを集めます。リリース前にはエージェントを、回帰テストにはスクリプト化したフローを使いましょう。

Firebase Test Lab Robo、mobile-mcp、phonedriver、人間のベータテスターも含めた詳しい比較：[docs/compare.md](docs/compare.md)（英語）。

## 自分のアプリをテストする

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

| 入力 | |
|---|---|
| `source_repo`, `ref` | アプリのリポジトリとブランチ（空 = このリポジトリ）。プライベートリポジトリの場合は読み取り専用の `SOURCE_REPO_TOKEN` シークレットを追加 |
| `app_dir`, `app_id` | アプリのフォルダー、Android のパッケージ名 / iOS の bundle id（もう一方のプラットフォームが別の id を使う場合は、ビルドしたアプリから読み取ります） |
| `android_personas`, `ios_personas` | [personas.json](personas.json) の id（1 つにつき 1 台）、`all`、またはプラットフォームを飛ばす `none`。20 人が用意済み：14 言語、右から左、タブレット、小さい文字からアクセシビリティの最大サイズまで |
| `brief` | エージェントへの指示：探索なら [AGENT_BRIEF.md](AGENT_BRIEF.md)、改善レポートなら [briefs/improve.md](briefs/improve.md)、1 つの機能を試すなら自分で書いたもの |
| `bug_report` | 探索の代わりに再現するバグ：issue（`owner/repo#123` またはその URL）か、手順をそのまま書いたテキスト。各エージェントが自分の端末でその手順を試します（[briefs/reproduce.md](briefs/reproduce.md)） |
| `model`、`llm_base_url` | デフォルトは `sonnet`。費用を抑えるなら `haiku`、または Anthropic 互換の任意の API（キーは `LLM_API_KEY` シークレットに設定）（[docs/cheaper-models.md](docs/cheaper-models.md)） |
| `framework` | `auto`（デフォルト）、または下のフレームワークのいずれかを指定 |
| `android_build` + `apk_path`, `ios_build` + `ios_app_path` | 独自のビルドコマンド、またはビルド済みアプリのダウンロード（パスは `app_dir` からの相対パス） |
| `block_hosts` | テスト中にブロックする分析系のホスト |
| `record_video` | 各端末の画面録画（レポートと一緒に暗号化） |

**そのまま使えるもの**（自動検出）：

| フレームワーク | Android | iOS シミュレーター |
|---|---|---|
| Flutter | `flutter build apk --debug` | `flutter build ios --simulator` |
| React Native / Expo | Gradle release | Xcode, arm64 |
| ネイティブ Kotlin / Java、Swift / Objective-C | Gradle debug | Xcode, arm64 |
| Kotlin Multiplatform | Gradle debug | iOS アプリの Xcode プロジェクト |
| Capacitor / Ionic | `cap sync` 後に Gradle debug | `cap sync` 後に Xcode |
| .NET MAUI（ベータ） | `dotnet publish` | `iossimulator-arm64` 向けの `dotnet build` |
| その他すべて | `android_build` + `apk_path` | `ios_build` + `ios_app_path` |

エージェントはスクリーンショットとアクセシビリティツリーから画面を読むので、どの UI ツールキットでも動きます。ラベル付きのウィジェット（Flutter の `Semantics`、`contentDescription`、`accessibilityLabel`）があると、より正確にタップできます。

## 仕組み

<p align="center"><img src="assets/how-it-works.svg" alt="仕組み：1 つのワークフローがアプリをビルドし、ペルソナごとに 1 台のエミュレーターまたはシミュレーターと 1 つのエージェント、暗号化されたレポート、手元のマシンでまとめ" width="100%"></p>

- **ペルソナ**が端末を決めます：機種、OS、文字サイズ、ダークモード、言語、位置情報。
- **エージェントごとに 3 つのツール**：画面を見る（タップ座標付き）、ジェスチャー、文字入力。
- **全画面でアクセシビリティチェック**：名前のないコントロールと、48 dp（Android）または 44 pt（iOS）未満のタップ領域を、エージェントがスクリーンショットで確認します。
- **結果は暗号化**：公開リポジトリのログは公開されるので、すべてあなたの鍵で暗号化します。
- **端末内で分析ツールをブロック**するので、テストが本番の統計に触れることはありません。
- **手元で 1 つのまとめ**：同じバグを指すレポートを Claude がまとめるので、各バグに何人のペルソナが当たったか、どのペルソナがどの種類の問題を見つけたかがわかります。
- **プッシュごとにテスト**（オフライン、スマホ不要）：アクセシビリティチェック、ペルソナの割り当て、まとめ、結果の暗号化（[tests/](tests/)）。

## 制限

- 公開リポジトリでは GitHub のランナーは無料：同時に約 20 ジョブ、そのうち macOS は 5 つ。
- 5 時間ごとの使用量上限があるプランでは、20 エージェントで約 15 分で上限に達します：6〜10 ずつ実行してください。
- ホステッドランナーはそのリポジトリ自身のプロジェクトのためのものです。クローズドソースのアプリは、プライベートリポジトリか自分の Mac でワークフローを実行してください。

## よくある質問

### 20 のエージェントが同じバグを 20 回見つけるだけでは？

いいえ。LocalSend では 103 件のレポートが 46 個の異なるバグにまとまり、そのうち 29 個は 1 つのエージェントしか見つけていません。唯一のブロッカーもその 1 つです（[実行記録](docs/runs/localsend-20.md)）。右から左のバグは 2 人のアラビア語ペルソナだけが、タブレットのバグは 4 台のタブレットだけが見つけました。重複したのは、空のデバイス一覧のように誰もが通るアプリ全体の状態です。

### 費用は？

公開リポジトリでは GitHub のランナーは macOS も含めて無料です。[これまでの実行](docs/runs/)では、モデル使用量はエージェント 1 つあたり 0.15〜0.55 ドルで、20 台でおよそ 5 ドルでした。Claude のサブスクリプションを使う場合は、請求ではなくプランの使用量として数えられます。費用を抑えるには、`model=haiku` かほかのプロバイダーのモデルで実行してください：[docs/cheaper-models.md](docs/cheaper-models.md)。

### 1 回の実行にかかる時間は？

各エージェントの探索は 1〜18 分です。AnkiDroid の 10 の Android エージェントは、開始から最後のレポートまで 10 分未満でした。LocalSend の 20 台はビルドを含めて 69 分かかりました。無料プランでは macOS のジョブが同時に 5 つまでだからです。

### Mac は必要？

いいえ。すべて GitHub のランナーで動きます：Android は Linux、iOS は macOS です。必要なのは `gh` コマンドと、Claude のサブスクリプションまたは API キーだけで、あとは `./setup.sh`（Windows では `.\setup.ps1`）がやってくれます。

### 2 回実行すると同じ結果になる？

なりません。各エージェントは探索するので、2 回の実行が同じ道をたどることはありません。同じ種類のバグは見つかりますが、同じリストにはなりません。回帰テストにはスクリプト化したテスト（Maestro、Appium）を使い続けてください。[比較](docs/compare.md)もどうぞ。

### レポートは公開される？

いいえ。公開リポジトリのログは公開されるので、レポート、スクリーンショット、動画はランナーを出る前にあなたの鍵で暗号化され、復号できるのはあなただけです。分析系のホストは端末内でブロックされます。本物のアカウントではなく、必ずテスト用アカウントを使ってください。詳しくは [PRIVACY.md](PRIVACY.md)。

### クローズドソースのアプリもテストできる？

できます。プライベートリポジトリからワークフローを実行し、読み取り専用の `SOURCE_REPO_TOKEN` でアプリのリポジトリを読み込むか、`android_build` と `ios_build` でビルド済みの APK や .app をダウンロードします。プライベートリポジトリでは Actions の利用時間を消費し、macOS の時間は 10 倍で数えられます。

### 自分でペルソナを作れる？

作れます。ペルソナは [personas.json](personas.json) の数行です：端末、OS のバージョン、言語、文字サイズ、ダークモード、位置情報、どんな人で何をしようとしているか。

### 苦手なことは？

画面を読み違えることがあります：LocalSend では 20 のエージェントのうち 3 つが、シミュレーターの英語キーボードをアプリの一部だと報告しました。エージェントごとの探索は数分なので、主な操作の流れはカバーしても、大きなアプリの隅々まではカバーしません。どの指摘にも番号付きのスクリーンショットが付くので、報告する前に確認してください。

## チーム向けホスト版（検討中）

このワークフローは今後も無料・オープンソースのまま、機能もすべてそろっています。非公開アプリを持つチーム向けに、ホスト版を検討しています。macOS ランナー込み（非公開リポジトリでは、GitHub は macOS の 1 分を 10 分として数えます）で、レポートをプロダクトマネージャーも含めたチーム全員と共有できる Web ダッシュボード付きです。

チームの役に立ちそうですか？ [3 つの質問に答える](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=teams.yml)か、[LinkedIn で連絡してください](https://www.linkedin.com/in/pierre-raffalli/)。もう自分のアプリで試しましたか？ [見つかったことと、つまずいたところを教えてください](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml)。

## スターの推移

[![Star History Chart](https://api.star-history.com/svg?repos=pierridotite/mobile-agent-testers&type=Date)](https://star-history.com/#pierridotite/mobile-agent-testers&Date)

## クレジット

[Claude Code](https://docs.claude.com/en/docs/claude-code) ·
[AXe](https://github.com/cameroncooke/axe) ·
[android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)

作者：[@pierridotite](https://github.com/pierridotite)（[LinkedIn](https://www.linkedin.com/in/pierre-raffalli/)）· MIT ライセンス
