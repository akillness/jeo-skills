# mobile-agent-testers (Claude Code plugin)

Sets up parallel AI testers for an iOS or Android app. Each tester is a
headless Claude Code agent with its own iOS Simulator or Android emulator on
GitHub Actions. It plays a persona (device, OS version, font size, dark mode,
language, location), uses the app like a new user and writes a bug report with
numbered screenshots. Reports are encrypted with your public key and merged
into one summary on your machine.

Works with Flutter, React Native, Expo, native Kotlin and Swift, Kotlin
Multiplatform, Capacitor and .NET MAUI, or any app you can build yourself.

Install:

```
/plugin marketplace add pierridotite/mobile-agent-testers
/plugin install mobile-agent-testers@mobile-agent-testers
```

Then ask Claude: "set up mobile agent testers for my app". The `setup` skill
creates the testers repo from the template, points it at your app, writes
personas for your audience and runs the first batch.

Network: the workflow runs on GitHub Actions and calls the Claude API from
there. The plugin itself only runs `gh`, `git` and the scripts of the template.
It never reads your credentials: you type them into the setup script in your
own terminal.

Template and full docs: https://github.com/pierridotite/mobile-agent-testers
Made by Pierre Raffalli: [GitHub](https://github.com/pierridotite) · [LinkedIn](https://www.linkedin.com/in/pierre-raffalli/)
License: MIT
