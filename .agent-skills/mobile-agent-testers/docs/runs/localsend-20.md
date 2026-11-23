# LocalSend on 20 phones

[LocalSend](https://github.com/localsend/localsend) (100k stars, Flutter), tested by 20 agents at the same time on 18 November 2026: 10 Android emulators and 10 iOS Simulators, 14 languages, text sizes from small to iOS's largest accessibility size.

| | |
|---|---|
| App | `main` of localsend/localsend, debug build, so Flutter's overflow stripes show |
| Agents | 20, one device each, no script |
| Reports | 103 (1 blocker, 15 major) |
| Distinct bugs | 46, grouped by hand, plus 2 groups of test artefacts set aside |
| Start to last report | 69 min, builds included (the Free plan runs 5 macOS jobs at a time) |
| Model usage | $4.62 for the 20 agents |
| Run | [44297752124](https://github.com/pierridotite/mobile-agent-testers/actions/runs/44297752124) (logs are public, reports are encrypted) |
| Raw data | [data/localsend-20.json](data/localsend-20.json): every report with its device, agent time and model usage |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/bugs-per-phone-dark.svg">
  <img src="../../assets/bugs-per-phone-light.svg" alt="29 of LocalSend's 46 bugs were seen by one phone only, the only blocker included. 6 bugs were seen by 2 phones, 6 by 3, and one each by 4, 5, 6, 10 and 12 phones. No bug was seen by more than 12 of the 20." width="100%">
</picture>

The bugs most phones saw are app-wide states: the nearby device list that never says nothing was found (12 phones), settings values cut at large text (10), a failed send that only says "Error" (6). Right-to-left bugs only came from the two Arabic personas, and tablet layout bugs only from the four tablets.

## Run it yourself

```bash
gh workflow run agent-testers.yml -f source_repo=localsend/localsend -f app_dir=app \
  -f app_id=org.localsend.localsend_app -f android_personas=all -f ios_personas=all -f record_video=true
```

Two runs never explore the same way, so expect the same kinds of bugs, not the same list.

## The 20 devices

| Persona | Device | OS | Language | Text size | Theme | Agent time | Model usage | Reports |
|---|---|---|---|---|---|---|---|---|
| anna | Small phone | Android 11 | en-GB | 130% | light | 1.2 min | $0.16 | 4 |
| felipe | Pixel 3a | Android 12 | pt-BR | 115% | light | 1.7 min | $0.20 | 6 |
| grace | Pixel 7 | Android 14 | en-US | 200% | light | 1.8 min | $0.20 | 5 |
| kenji | Pixel 4 | Android 11 | ja-JP | 100% | dark | 1.6 min | $0.19 | 4 |
| layla | Pixel 6 | Android 13 | ar-EG | 115% | light | 2.1 min | $0.23 | 4 |
| lucia | Pixel Tablet | Android 14 | es-ES | 100% | light | 2.6 min | $0.26 | 5 |
| malik | Pixel 7 | Android 14 | en-US | 100% | dark | 1.9 min | $0.23 | 4 |
| mehmet | Pixel 8 | Android 15 | tr-TR | 100% | dark | 2.6 min | $0.24 | 4 |
| olga | Pixel 5 | Android 12 | ru-RU | 100% | dark | 1.2 min | $0.17 | 5 |
| ravi | Small phone | Android 10 | hi-IN | 115% | light | 1.4 min | $0.17 | 6 |
| amira | iPhone 16 Pro | iOS 18 | ar-SA | Large (default) | light | 5.6 min | $0.21 | 5 |
| clara | iPhone SE (3rd generation) | iOS 18 | fr-FR | Large (default) | light | 5.1 min | $0.33 | 10 |
| giulia | iPhone 16 Plus | iOS 18 | it-IT | Accessibility M | light | 11.1 min | $0.29 | 4 |
| jonas | iPad Air 11-inch (M2) | iOS 18 | de-DE | Accessibility XL | dark | 5.9 min | $0.30 | 5 |
| mateo | iPad mini (A17 Pro) | iOS 18 | es-MX | Large (default) | light | 18.4 min | $0.27 | 5 |
| minjun | iPad Pro 13-inch (M4) | iOS 18 | ko-KR | Small | dark | 5.3 min | $0.21 | 5 |
| noah | iPhone 16 Pro Max | iOS 18 | en-US | XXXL (largest standard) | light | 5.5 min | $0.22 | 5 |
| sven | iPhone SE (3rd generation) | iOS 18 | sv-SE | Accessibility XXXL (largest) | dark | 1.8 min | $0.13 | 6 |
| wei | iPhone 16e | iOS 18 | zh-CN | XL | light | 16.4 min | $0.23 | 5 |
| yuki | iPhone 16 | iOS 18 | ja-JP | Medium | dark | 8.3 min | $0.37 | 6 |

Agent time is the agent's own session, from its first look at the screen to its report. The iOS agents wait longer for each screenshot.

## Every bug

Grouped by hand from the 103 reports, most phones first. "Checked" means the screenshots were opened and the bug is there; the others are as the agents reported them.

| # | Bug | Worst severity | Phones | Personas | Checked by hand |
|---|---|---|---|---|---|
| 1 | Nearby devices: endless loading skeleton, never says that nothing was found | major | 12 | clara, felipe, grace, kenji, lucia, malik, mateo, minjun, noah, ravi, wei, yuki |  |
| 2 | Settings values and device name cut, or broken mid-word | major | 10 | anna, felipe, giulia, grace, jonas, mehmet, noah, olga, ravi, sven | checked |
| 3 | A failed manual send only says "Error" ("Erreur", "Fehler", "エラー", "Hata", "Erro"), with no reason | major | 6 | clara, felipe, jonas, kenji, malik, mehmet | checked |
| 4 | Icon-only buttons next to Nearby devices have no accessibility label | minor | 5 | anna, mateo, noah, wei, yuki |  |
| 5 | The Send selection buttons overflow at large text and cut their labels | major | 4 | giulia, grace, jonas, sven | checked |
| 6 | iOS: a manual send to an address that does not answer waits forever, with no progress or error | major | 3 | amira, noah, yuki | checked |
| 7 | Tablets: phone layout in a narrow centred column, large empty areas | major | 3 | lucia, mateo, minjun |  |
| 8 | Tablets: sidebar labels cramped, hidden or misaligned | minor | 3 | jonas, mateo, minjun |  |
| 9 | "#16 #15" shown on the home screen with no explanation | minor | 3 | felipe, layla, ravi |  |
| 10 | Latin strings (LocalSend, PIN, IP) left in Arabic and Chinese screens | cosmetic | 3 | amira, layla, wei |  |
| 11 | Settings title off-centre | cosmetic | 3 | clara, felipe, kenji |  |
| 12 | Privacy policy and changelog only in English | minor | 2 | giulia, yuki |  |
| 13 | Arabic: numbers and units not localised, a size shown as "B 14" | minor | 2 | amira, layla |  |
| 14 | Android: the system navigation bar covers the last items of a list | minor | 2 | olga, ravi |  |
| 15 | Content tight against, or partly hidden under, the bottom bar | cosmetic | 2 | anna, grace |  |
| 16 | The info popup covers the History button | cosmetic | 2 | clara, layla |  |
| 17 | A text message is counted as "Files: 1" | cosmetic | 2 | clara, mateo |  |
| 18 | Text message dialog overflows by 149px; input and Bekräfta unreachable | blocker | 1 | sven | checked |
| 19 | Hinzufügen button overflows card by 114 px | major | 1 | jonas | checked |
| 20 | Nearby devices heading breaks mid-word, icons squeezed, list pushed off | major | 1 | sven |  |
| 21 | Receive via link screen overflows right by 28px, checkbox cut off | major | 1 | clara | checked |
| 22 | 'Jogo da velha' (tic-tac-toe) used as label for the # tab | minor | 1 | felipe |  |
| 23 | App text may not follow extra-large system text size | minor | 1 | wei |  |
| 24 | Brand name translated as 'स्थानीय भेजें (फाइल भेजो)' in colour setting | minor | 1 | ravi |  |
| 25 | First tap on Confirm in address dialog ignored | minor | 1 | noah |  |
| 26 | History button 'Supprimer l'historique' cut off at right edge | minor | 1 | clara |  |
| 27 | Keyboard covers Cancelar/Confirmar in manual-address dialog | minor | 1 | lucia | checked |
| 28 | No feedback after entering text message to send | minor | 1 | minjun |  |
| 29 | No length limit or hint for very long alias; shown truncated | minor | 1 | mehmet |  |
| 30 | Receive tab blank with no visible content | minor | 1 | sven |  |
| 31 | Text item in selection list cuts off the date/number (fade, no wrap) | minor | 1 | wei |  |
| 32 | Text selection shows icon only, Edit not button-like | minor | 1 | anna |  |
| 33 | Type message dialog closes and discards input on scrim tap or a missed Confirm | minor | 1 | malik |  |
| 34 | 'App' selection button wraps alone onto second row despite free width | cosmetic | 1 | lucia |  |
| 35 | 'Presse-papiers' fills its button with no padding | cosmetic | 1 | clara |  |
| 36 | Advanced settings label for discovery timeout is mistranslated as a status | cosmetic | 1 | yuki |  |
| 37 | Alias dialog changes width while typing long text | cosmetic | 1 | mehmet |  |
| 38 | Cramped icon row next to 'Appareils à proximité' | cosmetic | 1 | clara |  |
| 39 | Download folder shown as '(Загрузки)' with parentheses | cosmetic | 1 | olga |  |
| 40 | Edit/Add buttons in selection card inconsistent, '+' misaligned | cosmetic | 1 | ravi |  |
| 41 | Grammar: 'Адрес мультивещание' | cosmetic | 1 | olga |  |
| 42 | Hashtag hint shows partial IP '10.0.2.' before input | cosmetic | 1 | kenji |  |
| 43 | History buttons disabled and misaligned with title | cosmetic | 1 | minjun |  |
| 44 | IP hint trailing dot jumps to wrong side while typing (bidi) | cosmetic | 1 | amira |  |
| 45 | Language setting styled as plain button unlike dropdowns above | cosmetic | 1 | amira |  |
| 46 | PIN dialog prefilled with random PIN, unexplained; settings PIN toggle inconsistent with link-receive PIN | cosmetic | 1 | yuki |  |
|  | The Simulator's English keyboard sheet (not the app) | minor | 3 | clara, giulia, sven | set aside: test artefact |
|  | A screenshot taken before the screen changed (timing) | cosmetic | 1 | malik | set aside: test artefact |

## If you maintain LocalSend

If a finding is wrong, or the setup was unfair to the app, [open an issue](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=LocalSend%20run:%20) and it gets fixed and run again.
