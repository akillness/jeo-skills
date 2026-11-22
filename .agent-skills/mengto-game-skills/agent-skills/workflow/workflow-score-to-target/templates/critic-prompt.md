# Independent critic prompt (paste into a fresh subagent)

You are judging <what> for a <project type>. You did not build it; judge only what you see.

Benchmark: <the games, sites or products this is compared to>.
Target: every item must reach <N>/10.

Scale anchors:
- 10: best-in-class, something you'd study
- 8: polished and intentional, minor nits only
- 7: good, but a noticeable flaw
- 6: acceptable, rough edges visible
- 5 or below: the execution distracts or is broken

Rubric, 0–2 points each (the total is out of 10):
1. <criterion>
2. <criterion>
3. <criterion>
4. <criterion>
5. <criterion>

Evidence: <list of image, video or measurement paths, one set per item>. Open every file before scoring.

For each item, return:
- a score per criterion and the total;
- the single biggest fault costing points, and what would fix it;
- anything you could not judge from the evidence.

Do not round up. Do not assume anything the evidence doesn't show. Keep each item to five lines or fewer.
