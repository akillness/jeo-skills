# mobile-agent-testers

<a href="https://www.producthunt.com/posts/mobile-agent-testers?utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=mobile-agent-testers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=dark"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=light" alt="Mobile Agent Testers on Product Hunt" width="250" height="54"></picture></a>
<a href="https://www.linkedin.com/in/pierre-raffalli/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/linkedin-follow-dark.svg"><img src="assets/linkedin-follow-light.svg" alt="Follow Pierre Raffalli on LinkedIn" width="160" height="54"></picture></a>

**20 AI testers on 20 different phones, in parallel, on GitHub's free runners.**

**[Examples](docs/examples.md)** · **[Compare](docs/compare.md)** · **[FAQ](#faq)** · **[Personas](personas.json)** · **[Releases](https://github.com/pierridotite/mobile-agent-testers/releases)**

English · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Português](README.pt-BR.md)

No test scripts to write. Each tester is a Claude Code agent with its own iOS
Simulator or Android emulator on GitHub Actions. It plays a persona (iPhone SE
in Swedish at the largest text size, Pixel 7 at 200%, iPad in German, Arabic
right to left...), uses your app like a new user (or runs through the feature you
point it at) and writes a bug report with screenshots. Flutter, React Native, Expo, native Kotlin and Swift, Kotlin
Multiplatform, Capacitor and .NET MAUI.

GitHub's runners are free for public repos. You only pay for the model, with your
Claude subscription or API key: about $0.15 to $0.55 per phone in [these runs](docs/runs/).

<p align="center"><a href="assets/localsend-20.mp4"><img src="assets/localsend-20.gif" alt="Real screen recordings of 20 AI testers using LocalSend at the same time: 10 Android emulators and 10 iOS Simulators in 14 languages, from a small Pixel to a 13-inch iPad. When a tester finishes, its phone shows how many issues it found. Opens the video." width="100%"></a><br>
<sub>Real screen recordings of the LocalSend run, idle time cut. <a href="assets/localsend-20.mp4">Full video (MP4)</a> · <a href="docs/runs/localsend-20.md">The run, device by device</a></sub></p>

[![Tests](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml/badge.svg)](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/pierridotite/mobile-agent-testers?style=flat)](https://github.com/pierridotite/mobile-agent-testers/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![iOS + Android](https://img.shields.io/badge/platforms-iOS%20%2B%20Android-blue)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)
[![Last commit](https://img.shields.io/github/last-commit/pierridotite/mobile-agent-testers)](https://github.com/pierridotite/mobile-agent-testers/commits/main)

## What it does

One use per run, set with the inputs of [Test your own app](#test-your-own-app).

- **Explore like new users** (the default). Each persona tries to reach its goal and reports what gets in the way, with numbered screenshots.
- **Run one feature end to end.** Your own brief sends every agent through a whole mechanic: a booking in several steps, an editor with undo, a sync between two screens. Agents tap, long press, swipe and type, leave the app and come back, relaunch it to check what was saved, or open a deep link to start right at the feature, and a brief can raise the budget of about 30 actions. [AnkiDroid's](briefs/ankidroid.md) found the Back field of a new card hidden behind the keyboard.
- **Reproduce a bug report** on every phone: give an issue or the steps, and each agent answers yes, no or unclear, with screenshots ([briefs/reproduce.md](briefs/reproduce.md)).
- **Get an improvement report.** Each persona uses the app once, then says where it hesitated, what it expected and what to change first, by area and impact ([briefs/improve.md](briefs/improve.md)).
- **Compare two versions.** The same personas on two branches or builds, then one table: goals reached, actions, scores, issues seen on one version only ([docs/compare-versions.md](docs/compare-versions.md)). A check before a real A/B test, not a replacement for one.
- **Use a cheaper model**: Claude Haiku, or any Anthropic-compatible API (OpenRouter, DeepSeek, Kimi, GLM, MiniMax, Qwen). The findings are only as good as the model's reading of screenshots and its reasoning ([docs/cheaper-models.md](docs/cheaper-models.md)).

## Applied examples

Real runs on open-source apps, with nothing planted.

| App | Phones | What the agents found | Time, model usage |
|---|---|---|---|
| [LocalSend](https://github.com/localsend/localsend) (Flutter, 100k stars) | 20: 10 Android, 10 iOS, 14 languages | 46 distinct bugs, 1 blocker: on an iPhone SE in Swedish at the largest text size, you can't send a text message at all | 69 min, $4.62 |
| [AnkiDroid](https://github.com/ankidroid/Anki-Android) (Kotlin, 12k stars, release APK) | 10 Android | 43 distinct issues, among them answer buttons cut in half at 200% font and "Get started" left in English in three languages | under 10 min, $4.69 |
| [Flutter's animations sample](https://github.com/flutter/packages/tree/main/packages/animations/example) | 1 Android, 1 iOS | The same typo, reported by both agents on their own, and an app that ignores dark mode | 19 min, $0.47 |

34 of LocalSend's 46 bugs had nothing to do with text size or accessibility: broken flows, silent failures, missing translations, tablet layouts. Screenshots, every finding and the commands to run them again: [docs/examples.md](docs/examples.md).

## Quick start

```bash
gh repo create my-testers --public --template pierridotite/mobile-agent-testers --clone
cd my-testers && ./setup.sh           # key pair + secrets + Claude token (Windows: .\setup.ps1)
gh workflow run agent-testers.yml     # demo: 2 Android + 2 iOS testers, ~20 min
bash scripts/collect.sh <run id>      # decrypts reports, groups duplicates: runs/<id>/SUMMARY.md
```

The demo app has [11 deliberate bugs](demo-app/BUGS.md). In [one run](docs/runs/), the 4 demo testers found 9 of them (2 to 7 minutes per agent, about 21 minutes for the whole run, builds included), plus real issues nobody planted (a button under the Android nav bar, no data kept after a relaunch). Model usage: $0.87 for the 4.

Or let Claude set it up for your app:

```
/plugin marketplace add pierridotite/mobile-agent-testers
/plugin install mobile-agent-testers@mobile-agent-testers
```

## Why not Maestro, Appium or agent-device?

They run the tests you write. These agents look for what nobody thought to test.

| | mobile-agent-testers | Maestro, Appium, Detox, e2e |
|---|---|---|
| You write | Nothing: pick personas from the list | Flows or test code |
| It catches | Broken flows, silent errors, missing translations, layout at large text, dark mode, confusing copy | What each test checks |
| Same result every run | No: each run explores, so check the screenshots | Yes |

[agent-device](https://github.com/callstackincubator/agent-device) gives one coding agent hands on one simulator. This runs a whole session: it builds the app, gives each persona its own device and collects encrypted reports. Use agents before a release, and scripted flows for regressions.

Full comparison, with Firebase Test Lab Robo, mobile-mcp, phonedriver and human beta testers: [docs/compare.md](docs/compare.md).

## Test your own app

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

| Input | |
|---|---|
| `source_repo`, `ref` | App repo and branch (empty = this repo). Private repo: add a read-only `SOURCE_REPO_TOKEN` secret |
| `app_dir`, `app_id` | App folder, Android package / iOS bundle id (if the other platform uses another id, it is read from its built app) |
| `android_personas`, `ios_personas` | Ids from [personas.json](personas.json), one phone each, `all`, or `none` to skip a platform. 20 ready: 14 languages, right to left, tablets, text from small to the largest accessibility size |
| `brief` | Agent instructions: [AGENT_BRIEF.md](AGENT_BRIEF.md) to explore, [briefs/improve.md](briefs/improve.md) for an improvement report, or your own for one feature |
| `bug_report` | A bug to reproduce instead of exploring: an issue (`owner/repo#123` or its URL) or the steps as text. Each agent follows it on its own device ([briefs/reproduce.md](briefs/reproduce.md)) |
| `model`, `llm_base_url` | `sonnet` by default, `haiku` to spend less, or any Anthropic-compatible API with its key in an `LLM_API_KEY` secret ([docs/cheaper-models.md](docs/cheaper-models.md)) |
| `framework` | `auto` (default) or force one of the frameworks below |
| `android_build` + `apk_path`, `ios_build` + `ios_app_path` | Your own build command, or a download of a prebuilt app (paths relative to `app_dir`) |
| `block_hosts` | Analytics hosts blocked during tests |
| `record_video` | Screen recording of each phone, encrypted with the reports |

**Supported out of the box** (detected automatically):

| Framework | Android | iOS Simulator |
|---|---|---|
| Flutter | `flutter build apk --debug` | `flutter build ios --simulator` |
| React Native / Expo | Gradle release | Xcode, arm64 |
| Native Kotlin / Java, Swift / Objective-C | Gradle debug | Xcode, arm64 |
| Kotlin Multiplatform | Gradle debug | Xcode project of the iOS app |
| Capacitor / Ionic | Gradle debug after `cap sync` | Xcode after `cap sync` |
| .NET MAUI (beta) | `dotnet publish` | `dotnet build` for `iossimulator-arm64` |
| Anything else | `android_build` + `apk_path` | `ios_build` + `ios_app_path` |

Agents read the screen from screenshots and the accessibility tree, so any UI
toolkit works. Labelled widgets (Flutter `Semantics`, `contentDescription`,
`accessibilityLabel`) give them more precise tap targets.

## How it works

<p align="center"><img src="assets/how-it-works.svg" alt="How it works: one workflow builds the app, then one emulator or simulator with one agent per persona, encrypted reports, summary on your machine" width="100%"></p>

- **Personas** set the device: model, OS, font size, dark mode, language, location.
- **Three tools per agent**: see the screen (with tap coordinates), gestures, typing.
- **Accessibility check** on every screen: controls with no name and touch targets under 48 dp (Android) or 44 pt (iOS), for the agent to confirm on the screenshot.
- **Encrypted results**: public repo logs are public, so everything is encrypted with your key.
- **Analytics blocked** inside the phones, so tests never touch your real stats.
- **One summary** on your machine: Claude groups the reports that describe the same bug, so you see how many personas hit each one and which personas found which kind of issue.
- **Tests** on every push, offline and with no phone: accessibility check, persona matrix, summary, encrypted results ([tests/](tests/)).

## Limits

- GitHub runners are free for public repos: about 20 jobs at once, 5 on macOS.
- On plans with a 5-hour usage limit, 20 agents can use it up in ~15 min: run batches of 6-10.
- Hosted runners are meant for the repo's own project. For a closed-source app, run the workflow in your private repo or on your own Mac.

## FAQ

### Do 20 agents just find the same bug 20 times?

No. On LocalSend, the 103 reports were 46 distinct bugs, and 29 of them were found by one agent only, the blocker included ([chart](docs/examples.md#localsend-20-agents-20-devices-14-languages)). Right-to-left bugs only came from the two Arabic personas, and tablet bugs from the four tablets. The duplicates were app-wide states that everyone hits, like the empty device list.

### How much does it cost?

GitHub's runners are free for public repos, macOS included. Model usage was $0.15 to $0.55 per agent in [these runs](docs/runs/), so about $5 for 20 phones. With a Claude subscription, runs count against your plan's usage instead of a bill. To spend less, run `model=haiku` or another provider's model: [docs/cheaper-models.md](docs/cheaper-models.md).

### How long does a run take?

Each agent explores for 1 to 18 minutes. AnkiDroid's 10 Android agents took under 10 minutes from start to the last report. LocalSend's 20 devices took 69 minutes, builds included, because the Free plan runs 5 macOS jobs at a time.

### Do I need a Mac?

No. Everything runs on GitHub's runners: Linux for Android, macOS for iOS. You need the `gh` CLI and a Claude subscription or API key, and `./setup.sh` (`.\setup.ps1` on Windows) does the rest.

### Will two runs give the same result?

No. Each agent explores, so two runs never take the same path: expect the same kinds of bugs, not the same list. Keep scripted tests (Maestro, Appium) for regressions, see [how it compares](docs/compare.md).

### Are my reports public?

No. The logs of a public repo are public, so reports, screenshots and videos are encrypted with your key before they leave the runner, and only you can decrypt them. Analytics hosts are blocked inside the phones. Use test accounts, never real ones. More in [PRIVACY.md](PRIVACY.md).

### Can I test a closed-source app?

Yes. Run the workflow from a private repo, with a read-only `SOURCE_REPO_TOKEN` for your app's repo, or point `android_build` and `ios_build` at a prebuilt APK or .app. Private repos use your Actions minutes, and macOS minutes count ten times.

### Can I make my own personas?

Yes. A persona is a few lines in [personas.json](personas.json): device, OS version, language, text size, dark mode, location, who they are and what they try to do.

### What does it get wrong?

It sometimes misreads a screen: 3 of LocalSend's 20 agents flagged the Simulator's English keyboard as part of the app. A few minutes per agent covers the main paths, not every corner of a big app. Every finding comes with numbered screenshots, so check them before filing anything.

## Hosted version for teams (exploring)

The workflow here stays free, open source and complete. I'm exploring a hosted version for teams with private apps: macOS runners included (on a private repo, GitHub counts each macOS minute ten times) and a web dashboard to share the reports with the whole team, product managers included.

Would that help your team? [Answer three questions](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=teams.yml) or [write to me on LinkedIn](https://www.linkedin.com/in/pierre-raffalli/). Already ran it on your app? [Tell me what it found and what got in the way](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml).

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=pierridotite/mobile-agent-testers&type=Date)](https://star-history.com/#pierridotite/mobile-agent-testers&Date)

## Credits

[Claude Code](https://docs.claude.com/en/docs/claude-code) ·
[AXe](https://github.com/cameroncooke/axe) ·
[android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)

Made by [@pierridotite](https://github.com/pierridotite) ([LinkedIn](https://www.linkedin.com/in/pierre-raffalli/)) · MIT license
