# 適用例

[English](examples.md) · [简体中文](examples.zh-CN.md) · 日本語 · [Español](examples.es.md) · [Português](examples.pt-BR.md)

オープンソースのアプリでの実際の実行です。仕込んだバグはありません。 数字はすべて[実行記録](runs/)から取っています。そこでは、すべてのレポートを端末ごとに見られます。

## アクセシビリティだけではない

大きな文字のスクリーンショットは目を引きますが、エージェントが報告する内容のほんの一部です。各ペルソナには目標があり（「英語を使わずにタスクを 1 つ終える」「すべての入力欄にトルコ語の文字、絵文字、とても長いテキストを入れる」「途中でアプリを離れて、また戻ってくる」）、新しいユーザーとしてそれを達成しようとするので、行く手をはばむものは何でも報告されます。

- **途切れるフローと黙った失敗**：デバイス一覧が読み込み続け、見つからなかったと一度も言わない（20 台中 12 台）。手動送信の失敗が「Error」としか表示されない。アドレスが応答しないとダイアログが待ち続ける。テキスト入力のダイアログが、外側を一度タップしただけで入力内容を捨てる。
- **オンボーディングと権限**：AnkiDroid は、システム画面で「すべてのファイルへのアクセス」を許可するまで、説明なしにセットアップを止めます（10 エージェント中 8）。
- **翻訳**：ポルトガル語、スペイン語、日本語の端末で「Get started」が英語のまま。ポルトガル語で # タブの名前が「Jogo da velha」（三目並べ）。アラビア語でサイズが「B 14」と表示される。日付が端末の形式ではなく ISO 形式。プライバシーポリシーが英語のみ。
- **文言**：Flutter 公式サンプルのタイプミス。テキストメッセージが「Files: 1」と数えられる。ホーム画面に説明のない「#16 #15」。
- **デバイス**：タブレットでスマホのレイアウトが細い列に表示される。キーボードが「キャンセル」と「確認」を隠す。Android のナビゲーションバーがリストの最後の項目に重なる。ダークモードに対応していないアプリ。
- **データ**：再起動すると何も保存されていない（デモアプリ）。

LocalSend では、46 件のバグのうち 34 件が文字サイズともアクセシビリティとも無関係でした。どのレポートも最後にペルソナ自身の意見と 10 点満点のスコア（このアプリを使い続けるか？）が付くので、壊れている箇所だけでなく、新しいユーザーがどこで迷うかもわかります。

## LocalSend：20 エージェント、20 台、14 言語

<p align="center"><img src="../assets/real-findings-localsend-20.png" alt="Flutter のオーバーフロー表示が出た LocalSend の 4 画面、問題箇所を赤枠で表示：フォント 200% の Pixel 7 では送信ボタン 6 つがすべてはみ出し、スウェーデン語で文字サイズ最大の iPhone SE ではメッセージのダイアログが 149 ピクセルはみ出して入力欄と確認ボタンが隠れ、ドイツ語の iPad Air では追加ボタンがカードから 114 ピクセルはみ出し、フランス語で標準の文字サイズの iPhone SE では 1 行が 28 ピクセルはみ出している" width="100%"></p>

[LocalSend](https://github.com/localsend/localsend) はスター数 10 万の Flutter アプリです。エージェントが見つけたもの：

- スウェーデン語、iOS の最大の文字サイズの iPhone SE：メッセージのダイアログが 149 px はみ出し、入力欄と「確認」が画面外になるため、テキストを一切送れません。
- Android のフォント 200% の Pixel 7：6 つの送信ボタンがすべてはみ出し、ラベルが半分に切れます。イタリア語で、アクセシビリティの最初のサイズの iPhone 16 Plus でも同じです。
- ドイツ語で大きな文字の iPad Air：「Hinzufügen」がカードから 114 px はみ出し、設定の値が単語の途中で改行されます。
- フランス語で標準の文字サイズの iPhone SE：「Recevoir via un lien」が 28 px はみ出し、チェックボックスが隠れます。
- スペイン語の Pixel Tablet：キーボードがアドレス入力ダイアログの「キャンセル」と「確認」を覆います。
- 手動送信に失敗すると、「Error」「Erreur」「Fehler」「エラー」「Hata」「Erro」としか表示されず、理由がわかりません。iOS では、応答しないアドレスに送るとダイアログが進捗表示もなく待ち続けます（3 つのエージェントがそれぞれ発見）。

レポートは全部で 103 件（ブロッカー 1 件、重大 15 件）。手作業でまとめると 46 個の異なるバグになり、その多くは 1 台の端末でしか見つかっていません：

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bugs-per-phone-dark.svg">
  <img src="../assets/bugs-per-phone-light.svg" alt="LocalSend の 46 個のバグのうち 29 個は 1 台の端末でしか見つからず、唯一のブロッカーもその中に含まれます。2 台で見つかったものが 6 個、3 台が 6 個、4、5、6、10、12 台がそれぞれ 1 個。20 台中 12 台を超えて見つかったバグはありません。" width="100%">
</picture>

開始から最後のレポートまで 69 分（無料プランでは macOS のジョブは同時に 5 つまで）、20 エージェントのモデル使用量は合計 4.62 ドル。すべてのレポートを端末ごとに：[docs/runs/localsend-20.md](runs/localsend-20.md)。自分で実行するには：

```bash
gh workflow run agent-testers.yml -f source_repo=localsend/localsend -f app_dir=app \
  -f app_id=org.localsend.localsend_app -f android_personas=all -f ios_personas=all -f record_video=true
```

## AnkiDroid：10 エージェント、リリース版 APK をそのまま使用

<p align="center"><img src="../assets/real-findings-ankidroid.png" alt="AnkiDroid の 4 画面、問題箇所を赤枠で表示：フォント 200% の Pixel 7 で Again、Hard、Good、Easy のボタンが半分に切れている（拡大表示）、同じ端末の統計ページで文字が右端からはみ出している、ポルトガル語と日本語のようこそ画面で Get started ボタンが英語のまま" width="100%"></p>

[AnkiDroid](https://github.com/ankidroid/Anki-Android) はスター数 1.2 万の Kotlin アプリです。10 のエージェントが 10 台の Android エミュレーターで、GitHub のリリースにある APK をそのまま使い、ビルドなしでテストしました：

- Android のフォント 200% の Pixel 7：Again / Hard / Good / Easy のボタンが半分に切れ、統計ページの文字が右端からはみ出します。別のエージェントは、2.26 のアルファ版でもボタンが切れたままで、「Show large answer buttons」をオンにすると 2 段とも切れることを確認しました。
- ポルトガル語、スペイン語、日本語に設定した端末で、ようこそ画面の「Get started」が英語のままです。画面のほかの部分は翻訳されています（3 つのエージェントがそれぞれ発見）。

レポートは 83 件で、43 個の異なる問題にまとまりました（そのうち 2 つは Android 10 と 11 のエミュレーターイメージに入っている古いシステム WebView が原因で、アプリのせいではありません）。開始から最後のレポートまで 10 分未満、10 エージェントのモデル使用量は合計 4.69 ドル。すべてのレポート：[docs/runs/ankidroid-10.md](runs/ankidroid-10.md)。自分で実行するには：

```bash
gh workflow run agent-testers.yml -f app_dir=. -f app_id=com.ichi2.anki -f brief=briefs/ankidroid.md \
  -f android_build="curl -fsSL -o anki.apk https://github.com/ankidroid/Anki-Android/releases/download/v2.25.3/AnkiDroid-2.25.3-full-universal.apk" \
  -f apk_path=anki.apk -f android_personas=all -f ios_personas=none -f block_hosts="ankiweb.net www.google-analytics.com"
```

## Flutter 公式のアニメーションサンプル

<p align="center"><img src="../assets/real-finding-flutter.png" alt="Flutter のアニメーションサンプルアプリの同じ画面を表示した 2 台、Pixel 7 とフランス語の iPhone SE。タイトルの Streamling your courses が丸で囲まれている：2 つのエージェントがそれぞれこのタイプミスを報告した" width="100%"></p>

[flutter/packages のサンプルアプリ](https://github.com/flutter/packages/tree/main/packages/animations/example)で、Pixel 7 のエージェントとフランス語の iPhone SE のエージェントが、それぞれ同じタイプミス「Streamling your courses」（[110 行目](https://github.com/flutter/packages/blob/main/packages/animations/example/lib/shared_axis_transition.dart#L110)）を報告し、Android のほうはアプリがダークモードに対応していないことにも気づきました。19 分、モデル使用量 0.47 ドル。

自分のアプリで試しましたか？[見つかったものを共有](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=Finding:%20)してもらえれば、[実行記録](runs/)に加えます。これらのアプリのメンテナーの方で、間違った指摘があると思われる場合は issue を開いてください。修正して実行し直します。
