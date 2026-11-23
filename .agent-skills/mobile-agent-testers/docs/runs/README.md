# Runs

Every number in the README and in the [applied examples](../examples.md) comes from one of these runs. Each page has the command to run it again, the devices, what every agent reported, and what was checked by hand.

| Run | App | Devices | Reports | Distinct bugs | Start to last report | Model usage |
|---|---|---|---|---|---|---|
| [LocalSend on 20 phones](localsend-20.md) | [LocalSend](https://github.com/localsend/localsend), Flutter, 100k stars | 10 Android + 10 iOS, 14 languages | 103 | 46, grouped by hand | 69 min | $4.62 |
| [AnkiDroid on 10 phones](ankidroid-10.md) | [AnkiDroid](https://github.com/ankidroid/Anki-Android) 2.25.3, Kotlin, release APK | 10 Android | 83 | 43, grouped by Claude | under 10 min | $4.69 |
| [Flutter animations sample](https://github.com/pierridotite/mobile-agent-testers/actions/runs/43994247513) | [flutter/packages](https://github.com/flutter/packages/tree/main/packages/animations/example) example app | 1 Android + 1 iOS | | both found the same typo | 19 min | $0.47 |
| [Demo app](https://github.com/pierridotite/mobile-agent-testers/actions/runs/43949929362) | [demo-app](../../demo-app), 11 planted bugs | 2 Android + 2 iOS | | 9 of the 11 | 21 min | $0.87 |

Raw data, one JSON file per run, is in [data/](data): device, agent time, number of turns, model usage and every report.

"Model usage" is what the agents' tokens would cost at API prices. On a Claude subscription, the runs count against your plan's usage instead.

## Add yours

Ran it on an open-source app? [Open an issue](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=Run:%20) with the app, the personas and what the agents found, and it can get its page here. `bash scripts/collect.sh <run id>` gives you the summary to paste.

## Maintainers

If you maintain one of these apps and think a finding is wrong, or the setup was unfair to your app, open an issue and it gets fixed and run again.
