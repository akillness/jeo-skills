# The brief and the budget

## Ask once, then run

Collect everything in one round, then produce without stopping until the priced storyboard needs its
sign-off:

- Team and project (see the `scenario` skill), the product shot, and brand assets: logo file, brand
  colors, font file if exact type matters, any character or mascot reference.
- One objective: awareness, consideration, or conversion. Refuse to storyboard a brief carrying two:
  brand-building wants pure emotion and activation wants demo plus offer, and one asset cannot do
  both jobs (Binet and Field's IPA work is the citable basis). Offer two cuts from one board
  instead.
- The audience as a person with a current mindset, not a demographic. A useful test is the
  Get/Who/To/By line: get (audience) who (mindset) to (one observable behavior) by (the lever). If
  the line would survive pasted onto a competitor's brief, sharpen it.
- The single-minded proposition: the one reason to buy, in one sentence. Viewers catch one message;
  a list of benefits lands as none.
- The two dials below, platforms and ratios, mandatories (legal lines, claims that must appear,
  forbidden imagery), and a spend ceiling in creative units.

## The two dials

| Dial       | Levels                                                  | Meaning                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creativity | `on-code` / `twist` (default) / `wild`                  | on-code plays the category's visual codes straight; twist opens inside the code and breaks one beat (the Kenzo World pattern); wild is concept-led and discards codes, which risks the category no longer reading as itself: flag that before proceeding. |
| Length     | `6s` bumper / `15s` short / `30s` full (60s on request) | 6s: 2 beats, 8 to 12 VO words. 15s: 4 to 6 beats, 30 to 35 words. 30s: 6 to 8 beats plus inserts, 60 to 70 words. Longer levels cost more in every stage.                                                                                                 |

## Objective to rulebook

| Objective     | Grammar                                                                                     | Default length | KPIs                                 | CTA                                            |
| ------------- | ------------------------------------------------------------------------------------------- | -------------- | ------------------------------------ | ---------------------------------------------- |
| Awareness     | Brand film: world-building, emotion, brand codes visible early and throughout               | 15 to 30s      | Reach, view-through, hook rate       | Brand beat end card, soft CTA                  |
| Consideration | Demonstration: one provable claim, proven visually (the Epic Split pattern)                 | 15 to 30s      | Click-through, engagement, view rate | Benefit line plus CTA                          |
| Conversion    | Performance: hook in the first 3 seconds, product and text in frame one, offer made plainly | 6 to 15s       | Click-through, cost per action, ROAS | Explicit text CTA, end card, offer in captions |

Hook rate (3-second views over impressions) is the creative diagnostic to name: treat a quarter to a
third of viewers surviving the hook as a healthy planning target, higher for retargeting than cold
audiences. Expect few variants to win, which is why hooks get alternates and the rest of the board
does not.

## Pricing the board

1. Shot count: performance cuts run one shot per 2 to 3 seconds; brand films run fewer, longer
   beats. Add 2 to 3 inserts.
2. Variants: 3 alternates for the hook shot, 1 take planned everywhere else.
3. Retry floors (planning assumptions, not industry averages): 3 generations per usable product-only
   shot, 5 to 10 for complex motion, liquids, or cloth, up to 20 when faces or hands are on screen.
   The floors are why the storyboard avoids humans unless the concept needs them.
4. Price it: `dry_run: true` on every planned `model_run` (the estimate rides in the dry-run
   response), multiply by the floors, add stills, audio, and assembly runs. Present the table, get
   the sign-off, then generate; when nobody can answer, the brief's spend ceiling stands in for the
   sign-off, so generate only while the priced board fits it.
5. Track with `usage`; the metric is cost per usable shot (spend over accepted clips). Same-day
   `usage` totals can lag aggregation, so ledger the per-job `cuCost` values as ground truth.
   Re-forecast after the first shot lands: the first scene is calibration.

The per-platform shipping checklist lives in [delivery.md](delivery.md).
