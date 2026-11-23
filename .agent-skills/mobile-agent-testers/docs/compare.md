# How it compares

Short version: scripted tests check the paths you already know, and these agents look for the ones you didn't think of. Most teams want both.

| | mobile-agent-testers | Scripted tests (Maestro, Appium, Detox) | Firebase Test Lab Robo | One phone for your coding agent (agent-device, mobile-mcp, phonedriver) | Human beta testers |
|---|---|---|---|---|---|
| You write | Nothing: pick personas | Flows or test code | Nothing | Prompts, in your session | A brief, then you wait |
| Devices | Up to 20 at once, each with its own language, text size and theme | As many as you run | Many, in Google's lab | One per session | As many people as you find |
| It judges | Layout at large text, translations, right to left, dead ends, confusing copy | What each step asserts | Crashes, plus screenshots for you to look at | Whatever you ask | Everything, in their own words |
| Same result every run | No | Yes | Mostly | No | No |
| Cost | Free runners for public repos, plus $0.15 to $0.55 of model usage per agent in [our runs](runs/) | Free locally, device clouds are paid | Free daily quota, then paid | Your agent's usage | Your time |
| Best for | Before a release, on device setups you don't own | Every build | A crash check | Building and debugging | Knowing if the app is worth it |

## mobile-agent-testers vs Maestro

[Maestro](https://github.com/mobile-dev-inc/maestro) runs YAML flows you write, the same way every time, for free on your machine. It also has experimental AI checks (`assertWithAI`, `assertNoDefectsWithAI`) that send a screenshot to a model, at the steps of your flow.

These agents have no flow. Each one decides where to go next as its persona, so they reach screens and settings your flows never open, on device setups you didn't write a flow for. Use Maestro so the paths you know keep working, and agents to find the bugs you didn't know about. They work well together: when an agent finds a bug, write a Maestro flow for it so it stays fixed.

## mobile-agent-testers vs Appium, Detox, Espresso and XCUITest

Same answer as Maestro: test code checks what it asserts, every build, the same way. It doesn't notice that a label is cut at 200% font unless someone wrote that assertion for that screen at that font size. Keep your test suite for regressions, and run agents before a release.

## mobile-agent-testers vs Firebase Test Lab Robo

[Robo](https://firebase.google.com/docs/test-lab/android/robo-ux-test) crawls your app on Google's devices with no script and reports crashes, with screenshots and a video (Android, and iOS in beta). It doesn't read the screen the way a person does: it won't tell you that "Get started" is still in English on a Japanese phone, or that a dialog can't be used at the largest text size. The agents do, in a report with numbered screenshots. Robo is a good crash check, and the agents add what a person would notice.

## mobile-agent-testers vs agent-device, mobile-mcp and phonedriver

[agent-device](https://github.com/callstackincubator/agent-device), [mobile-mcp](https://github.com/mobile-next/mobile-mcp) and [phonedriver](https://github.com/hridaya423/phonedriver) give your coding agent hands on one simulator or emulator, in your session. That's what you want while building a feature.

This runs a whole test session in CI instead: it builds the app, gives each persona its own device with its own language, text size and theme, runs them all at the same time, and collects encrypted reports with screenshots. Nobody has to watch.

## mobile-agent-testers vs human beta testers

People tell you whether the app is worth it, and agents can't. But a beta takes days, and few of your testers use an iPad in German at the largest text size, or read Arabic right to left. Run the agents first, so your beta testers spend their attention on the product and not on cut-off buttons.

## What the agents get wrong

- They sometimes misread a screen: on LocalSend, 3 of the 20 flagged the Simulator's English keyboard sheet, which isn't the app. Every finding comes with numbered screenshots, so check them before filing anything.
- Two runs never explore the same way, so expect the same kinds of bugs, not the same list.
- Each agent explores for a few minutes, not hours. They cover the main paths and the settings, not every corner of a big app. Give them a goal in a [brief](../briefs/ankidroid.md) to aim them at a feature.

Something here is wrong or unfair to one of these tools? [Open an issue](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=Compare%20page:%20) and it gets fixed.
