# Compare two versions

Run the same personas on two versions of your app, then put the two runs side by side.

1. Version A, for example your main branch:
   ```bash
   gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app -f ref=main \
     -f brief=briefs/improve.md -f android_personas=all -f ios_personas=all
   ```
2. Version B: the same command with `-f ref=new-onboarding` (another branch, tag or commit), or another prebuilt app with `android_build` and `ios_build`.
3. Collect both runs and compare them:
   ```bash
   bash scripts/collect.sh <run A>
   bash scripts/collect.sh <run B>
   python3 scripts/compare.py runs/<run A> runs/<run B> main new-onboarding > COMPARE.md
   ```

`COMPARE.md` shows, for each version, the goals reached (yes / partly / no), the median number of actions, the average score and the issues by severity. Then each persona on both versions, the issues seen on one version only, and the improvements the personas suggested, by area.

## What it tells you, and what it doesn't

It shows where each version blocks or confuses simulated new users: a step nobody gets through, a screen that takes twice the actions, a sentence that most personas misread, a regression on one device. That is worth knowing before real users see a version.

It does not tell you which version will convert or retain better. The personas are patient, read everything, never pay, and come from the same model, so their opinions move together. With ten personas, a gap of one or two either way is noise. Use it to fix each version before a real A/B test, not to pick the winner.

## Tips

- Change only the app: same personas, same brief and same model on both runs.
- [briefs/improve.md](../briefs/improve.md) gives every persona a goal and asks how many actions it took, which is what the comparison needs. Your own brief works too if it writes the same fields (`goal_reached`, `actions`, `score`).
- Both versions in one build, behind a flag? Write two briefs that each open their variant first (a deep link, a debug menu), and run each version with its brief.
- Each run explores in its own way. When a difference matters, run each version twice and keep what repeats.
