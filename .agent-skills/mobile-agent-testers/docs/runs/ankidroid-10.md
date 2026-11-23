# AnkiDroid on 10 phones

[AnkiDroid](https://github.com/ankidroid/Anki-Android) (12k stars, Kotlin), tested by 10 agents at the same time on 18 November 2026, straight from the APK of their GitHub release: no build, no source code.

| | |
|---|---|
| App | AnkiDroid 2.25.3, `AnkiDroid-2.25.3-full-universal.apk` from their GitHub release |
| Agents | 10, one Android emulator each (Android 10 to 15, 200% font, right to left, tablet), no script |
| Reports | 83 (14 major) |
| Distinct issues | 43, grouped by Claude with `scripts/collect.sh`, then checked by hand where marked |
| Start to last report | under 10 min |
| Model usage | $4.69 for the 10 agents |
| Run | [44327125792](https://github.com/pierridotite/mobile-agent-testers/actions/runs/44327125792) (marked failed on GitHub because it also tried to build an iOS app it didn't need, which `ios_personas=none` now skips), and a second run on the 2.26.0alpha14 APK for the answer buttons: [44332167336](https://github.com/pierridotite/mobile-agent-testers/actions/runs/44332167336) |
| Raw data | [data/ankidroid-10.json](data/ankidroid-10.json): every report with its device, agent time and model usage |

What held up when checked by hand: on a Pixel 7 at 200% font, the Again / Hard / Good / Easy buttons are cut in half (still the case on the 2.26 alpha, in both rows when "Show large answer buttons" is on), the Statistics text runs off the right edge, and the welcome screen keeps "Get started" in English on devices set to Portuguese, Spanish and Japanese.

## Run it yourself

```bash
gh workflow run agent-testers.yml -f app_dir=. -f app_id=com.ichi2.anki -f brief=briefs/ankidroid.md \
  -f android_build="curl -fsSL -o anki.apk https://github.com/ankidroid/Anki-Android/releases/download/v2.25.3/AnkiDroid-2.25.3-full-universal.apk" \
  -f apk_path=anki.apk -f android_personas=all -f ios_personas=none -f block_hosts="ankiweb.net www.google-analytics.com"
```

[briefs/ankidroid.md](../../briefs/ankidroid.md) tells the agents what AnkiDroid is for and to leave AnkiWeb alone: no sign-up, login or sync.

## The 10 devices

| Persona | Device | OS | Language | Text size | Theme | Agent time | Model usage | Reports |
|---|---|---|---|---|---|---|---|---|
| anna | Small phone | Android 11 | en-GB | 130% | light | 4.7 min | $0.44 | 8 |
| felipe | Pixel 3a | Android 12 | pt-BR | 115% | light | 3.7 min | $0.39 | 8 |
| grace | Pixel 7 | Android 14 | en-US | 200% | light | 4.3 min | $0.48 | 10 |
| kenji | Pixel 4 | Android 11 | ja-JP | 100% | dark | 4.8 min | $0.48 | 7 |
| layla | Pixel 6 | Android 13 | ar-EG | 115% | light | 3.7 min | $0.48 | 7 |
| lucia | Pixel Tablet | Android 14 | es-ES | 100% | light | 5.0 min | $0.56 | 10 |
| malik | Pixel 7 | Android 14 | en-US | 100% | dark | 4.7 min | $0.53 | 8 |
| mehmet | Pixel 8 | Android 15 | tr-TR | 100% | dark | 4.5 min | $0.51 | 9 |
| olga | Pixel 5 | Android 12 | ru-RU | 100% | dark | 3.7 min | $0.45 | 10 |
| ravi | Small phone | Android 10 | hi-IN | 115% | light | 3.1 min | $0.37 | 6 |

## Every issue

As Claude grouped the 83 reports, worst first. "Checked" means the screenshots were opened and the issue is there; "set aside" means it comes from the test setup, not from the app. The rest is as the agents reported it.

| Issue | Worst severity | Phones | Personas | Class | Checked by hand |
|---|---|---|---|---|---|
| Onboarding blocked until all-files permission granted, no explanation | major | 8 | anna, felipe, grace, kenji, layla, lucia, malik, olga | feedback and errors | set aside: the permission step is deliberate in this APK |
| Outdated WebView dialog is jargon with no close button | major | 3 | anna, kenji, ravi | feedback and errors | set aside: old system WebView of the Android 10 and 11 emulator images |
| Statistics screen blank on outdated WebView | major | 3 | anna, kenji, ravi | crash | set aside: old system WebView of the Android 10 and 11 emulator images |
| Add card back field hidden behind keyboard | major | 2 | anna, lucia | layout and text size |  |
| Answer buttons clipped at 200% font | major | 1 | grace | layout and text size | checked, and still there on the 2.26 alpha |
| Many strings untranslated in Hindi | major | 1 | ravi | translation |  |
| Statistics content overflows right edge | major | 1 | grace | layout and text size | checked |
| Tablet study screen small text and stretched buttons | major | 1 | lucia | tablet |  |
| Deck counters low contrast | minor | 6 | anna, grace, kenji, malik, mehmet, olga | visual polish |  |
| Card browser shows ISO date instead of locale format | minor | 4 | felipe, lucia, mehmet, olga | translation |  |
| Empty deck gives no feedback or hint | minor | 4 | felipe, lucia, malik, ravi | feedback and errors |  |
| Red '!' badge on sync icon without account | minor | 3 | felipe, olga, ravi | visual polish |  |
| Statistics calendar/axis labels tiny and overlapping | minor | 3 | layla, malik, mehmet | layout and text size |  |
| Untranslated 'Get started' button on welcome screen | minor | 3 | felipe, kenji, lucia | translation | checked (English string in their translations) |
| Back navigation lands on Card browser | minor | 2 | lucia, malik | feedback and errors |  |
| Card browser wraps words and dates mid-token | minor | 2 | anna, grace | layout and text size |  |
| Settings summaries cut or read oddly | minor | 2 | layla, mehmet | copy |  |
| Statistics untranslated/mixed English strings and odd count | minor | 2 | felipe, mehmet | translation |  |
| Awkward Turkish FAB label | minor | 1 | mehmet | translation |  |
| Clumsy Russian wording in browser | minor | 1 | olga | translation |  |
| Deck-list footer bidi word order scrambled | minor | 1 | layla | right to left | cause unclear |
| English accessibility labels | minor | 1 | lucia | accessibility |  |
| Font scaling slider hidden and limited in scope | minor | 1 | anna | accessibility |  |
| Hindi transliteration in sort field | minor | 1 | ravi | likely test artefact | test artefact (flagged by Claude) |
| Learning cards reappear, no end-of-study confirmation | minor | 1 | malik | feedback and errors |  |
| Long deck name makes rows and titles very tall | minor | 1 | mehmet | layout and text size |  |
| Mixed Arabic-Indic and Latin digits | minor | 1 | layla | right to left |  |
| Statistics Russian wording and plural errors | minor | 1 | olga | translation |  |
| Tablet deck list/browser layout sparse | minor | 1 | lucia | tablet |  |
| Top-placed Save/menu controls hard to reach one-handed | minor | 1 | kenji | likely test artefact | test artefact (flagged by Claude) |
| Untranslated Front/Back fields and card type | minor | 1 | olga | translation |  |
| Drawer header image/logo cropped | cosmetic | 5 | kenji, layla, malik, mehmet, olga | visual polish | probably by design |
| Last settings item touches gesture/nav bar | cosmetic | 2 | grace, olga | system bars |  |
| Anglicisms and stray punctuation in labels | cosmetic | 1 | felipe | translation |  |
| Browser title bar dropdown arrow and subtitle issues | cosmetic | 1 | lucia | visual polish |  |
| General settings icon inconsistency | cosmetic | 1 | olga | visual polish |  |
| Hidden 'AnkiDroid Flashcard' text exposed on review screen | cosmetic | 1 | felipe | visual polish |  |
| Interval '<' placement odd in RTL | cosmetic | 1 | layla | right to left |  |
| Intro paragraph appears cut off | cosmetic | 1 | grace | likely test artefact | test artefact (flagged by Claude) |
| Jargon on study answer buttons and empty state | cosmetic | 1 | anna | copy |  |
| Orphan '0' wrapped in Statistics | cosmetic | 1 | mehmet | layout and text size |  |
| Status bar clock overlaps drawer header | cosmetic | 1 | grace | system bars |  |
| Study counters stay small at large font | cosmetic | 1 | grace | accessibility |  |

## If you maintain AnkiDroid

If a finding is wrong, or the setup was unfair to the app, [open an issue](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=AnkiDroid%20run:%20) and it gets fixed and run again. Nothing from this run was filed on your tracker.
