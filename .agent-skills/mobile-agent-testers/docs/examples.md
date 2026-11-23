# Applied examples

English · [简体中文](examples.zh-CN.md) · [日本語](examples.ja.md) · [Español](examples.es.md) · [Português](examples.pt-BR.md)

Real runs on open-source apps, with nothing planted. Every number comes from [the runs](runs/), where each report is listed device by device.

## Not just accessibility

Large text makes the most striking screenshots, but it is a small part of what the agents report. Each persona has a goal ("finish one task without English", "fill every text field with Turkish characters, emoji and very long text", "leave the app in the middle of it, then come back") and tries to reach it like a new user, so the agents report whatever gets in the way:

- **Broken flows and silent failures**: a device list that loads forever and never says nothing was found (12 of 20 phones), a failed send that only says "Error", a dialog that waits forever when an address doesn't answer, a text dialog that throws away what you typed after one stray tap.
- **Onboarding and permissions**: AnkiDroid blocks setup until you grant all-files access on a system page, with no explanation (8 of its 10 agents).
- **Translations**: "Get started" left in English on Portuguese, Spanish and Japanese phones, the # tab labelled "Jogo da velha" (tic-tac-toe) in Portuguese, sizes written "B 14" in Arabic, ISO dates instead of the phone's format, a privacy policy only in English.
- **Copy**: a typo in Flutter's official sample, a text message counted as "Files: 1", "#16 #15" on the home screen with no explanation.
- **Devices**: tablets that show the phone layout in a narrow column, the keyboard over Cancel and Confirm, the Android navigation bar over the last items of a list, an app that ignores dark mode.
- **Data**: nothing kept after a relaunch (in the demo app).

On LocalSend, 34 of the 46 bugs had nothing to do with text size or accessibility. Every report also ends with the persona's opinion and a score out of 10 (would they keep the app?), so a run shows where new users get lost, not only what is broken.

## LocalSend: 20 agents, 20 devices, 14 languages

<p align="center"><img src="../assets/real-findings-localsend-20.png" alt="Four LocalSend screens with Flutter's overflow stripes, each boxed in red: a Pixel 7 at 200% text where all six Send buttons overflow, an iPhone SE in Swedish at the largest text size where the message dialog overflows by 149 pixels and hides the text field and Confirm, an iPad Air in German where the Add button overflows its card by 114 pixels, and an iPhone SE in French at the default text size where a row overflows by 28 pixels" width="100%"></p>

[LocalSend](https://github.com/localsend/localsend) is a 100k-star Flutter app. What the agents found:

- iPhone SE in Swedish at iOS's largest text size: the message dialog overflows by 149 px, so the text field and Confirm are off screen and you can't send text at all.
- Pixel 7 at Android's 200% font: all six Send buttons overflow and cut their labels in half. Same on an iPhone 16 Plus in Italian at the first accessibility size.
- iPad Air in German with large text: "Hinzufügen" runs 114 px past its card, and Settings values break mid-word.
- iPhone SE in French at the default text size: "Recevoir via un lien" overflows by 28 px and hides a checkbox.
- Pixel Tablet in Spanish: the keyboard covers the address dialog's Cancel and Confirm.
- A failed manual send says only "Error", "Erreur", "Fehler", "エラー", "Hata" or "Erro", with no reason. On iOS, an address that doesn't answer leaves the dialog waiting with no progress shown (three agents).

103 reports in all (1 blocker, 15 major). Grouped by hand, they are 46 distinct bugs, and most of them were seen by one phone only:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bugs-per-phone-dark.svg">
  <img src="../assets/bugs-per-phone-light.svg" alt="29 of LocalSend's 46 bugs were seen by one phone only, the only blocker included. 6 bugs were seen by 2 phones, 6 by 3, and one each by 4, 5, 6, 10 and 12 phones: the send buttons overflowing at large text, icon buttons with no accessibility label, a failed send that only says Error, settings values cut mid-word, and a device list that loads forever. No bug was seen by more than 12 of the 20." width="100%">
</picture>

69 minutes from start to the last report (the Free plan runs 5 macOS jobs at a time), $4.62 of model usage for the 20. Every report, device by device: [docs/runs/localsend-20.md](runs/localsend-20.md). Run it yourself:

```bash
gh workflow run agent-testers.yml -f source_repo=localsend/localsend -f app_dir=app \
  -f app_id=org.localsend.localsend_app -f android_personas=all -f ios_personas=all -f record_video=true
```

## AnkiDroid: 10 agents, straight from the release APK

<p align="center"><img src="../assets/real-findings-ankidroid.png" alt="Four AnkiDroid screens, each problem boxed in red: a Pixel 7 at 200% text where the Again, Hard, Good and Easy buttons are cut in half (shown magnified), the same phone's Statistics page where the lines run off the right edge, and the welcome screen in Portuguese and in Japanese where the Get started button is still in English" width="100%"></p>

[AnkiDroid](https://github.com/ankidroid/Anki-Android) is a 12k-star Kotlin app. 10 agents on 10 Android emulators, from the APK of their GitHub release, no build:

- Pixel 7 at Android's 200% font: the Again / Hard / Good / Easy buttons are cut in half, and the Statistics text runs off the right edge. A second agent found the buttons still cut on their 2.26 alpha, in both rows when "Show large answer buttons" is on.
- The welcome screen says "Get started" in English on devices set to Portuguese, Spanish and Japanese, while the rest of the screen is translated (three agents, each on its own).

83 reports, which group into 43 distinct issues (two of them come from the outdated system WebView of the Android 10 and 11 emulator images, not from the app). Under 10 minutes from start to the last report, $4.69 of model usage for the 10. Every report: [docs/runs/ankidroid-10.md](runs/ankidroid-10.md). Run it yourself:

```bash
gh workflow run agent-testers.yml -f app_dir=. -f app_id=com.ichi2.anki -f brief=briefs/ankidroid.md \
  -f android_build="curl -fsSL -o anki.apk https://github.com/ankidroid/Anki-Android/releases/download/v2.25.3/AnkiDroid-2.25.3-full-universal.apk" \
  -f apk_path=anki.apk -f android_personas=all -f ios_personas=none -f block_hosts="ankiweb.net www.google-analytics.com"
```

## Flutter's official animations sample

<p align="center"><img src="../assets/real-finding-flutter.png" alt="Two phones on the same screen of Flutter's animations example app, a Pixel 7 and an iPhone SE in French, with the title Streamling your courses circled: both agents reported this typo on their own" width="100%"></p>

In the [example app of flutter/packages](https://github.com/flutter/packages/tree/main/packages/animations/example), an agent on a Pixel 7 and another on an iPhone SE in French each reported the same typo, "Streamling your courses" ([line 110](https://github.com/flutter/packages/blob/main/packages/animations/example/lib/shared_axis_transition.dart#L110)), and the Android one noticed the app ignores dark mode. 19 minutes, $0.47 of model usage.

Ran it on your app? [Share what it found](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=Finding:%20) and it goes in [the runs](runs/). If you maintain one of these apps and think a finding is wrong, open an issue and it gets fixed and run again.
