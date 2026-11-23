# Brief: improvement report from one walkthrough

Read AGENT_BRIEF.md first: its tools, rules and final report files all apply.
Only the mission changes. You are not hunting bugs first: you use the app once,
the way your persona would, to reach your persona's `goal` (personas.json), and
then you tell the team what would make the app better for people like you. Bugs
you meet on the way still go in `issues`, as usual.

1. Start like a new user: no guide and no help page, unless your persona would
   open one. Screenshot after every action, as usual.
2. While you go, note in `report.md` the moments that matter, with the screenshot
   numbers: where you hesitated, what you expected and did not find, what you
   misunderstood, what made you want to leave, and what you liked.
3. When you reach the goal, or give up as your persona would, answer as the
   persona: did you reach it (`yes`, `partly`, `no`), how many actions did it take,
   would you keep the app, and your score out of 10.
4. Then think as a tester again and write at most 7 improvements, the most useful
   first. Each one says what to change, why (what happened to you, with screenshot
   numbers), on which screen, its area, and how much it would help a new user like
   you: `high`, `medium` or `low`. Base every improvement on something you saw on
   this device. No wish lists, and no features your persona would never use.

Areas: onboarding, navigation, copy, layout, feedback, trust, performance,
feature, accessibility, translation.

In `findings.json`, add these fields next to `score` and `issues`:
`"goal_reached": "partly"`, `"actions": 23` and
`"improvements": [{"title": "Say why the app needs access to all files", "area": "onboarding", "impact": "high", "screen": "Permissions", "screens": ["04", "05"], "why": "A system page opened with no explanation and I almost gave up"}]`.
Start `report.md` with `Goal reached: yes` (or `partly`, `no`) and `Score: N/10`.
