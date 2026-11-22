# Clock, budget and gates

A short comic is under an hour of work. It becomes three hours through sequential review rounds, a
fourth try chasing a verdict, reviewers that explore every file, and a stalled step nobody checks.
The gates below keep a short comic short. Every number is an authoring-time measurement or default,
and a number the user gave wins.

## Where the time goes

Measured on one 8-page comic, made twice with the same model:

| Share of the run                 | Without the caps | With the caps |
| -------------------------------- | ---------------- | ------------- |
| Total                            | 199 min          | 43 min        |
| Waiting on reviewers             | 53 min           | about 1 min   |
| A stalled step nobody noticed    | 27 min           | none          |
| Image generation                 | 21 min           | 13 min        |
| The agent's own reasoning, prose | 78 min           | 26 min        |

- One page image at the top quality takes about 70 to 100 seconds. Pages submitted together finish
  together, so eight pages cost about one image's time plus the launch spacing.
- Lower quality values take nearly the same time and cost far less. In one test the lowest value was
  about 20% faster and cost about a seventeenth of the top value. The middle value cost about a
  tenth.
- With the caps, the agent's own writing is the largest share. Shorter prompts for proofs and fewer
  rewrites are the next saving.

## Defaults for the Quick lane

| Item        | Default                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| Wall clock  | About 50 minutes for 6 to 8 pages, plus about 3 minutes per page after                |
| Hard stop   | 1.5 times the target, then ship what exists and list the gaps                         |
| Generations | At most 4 top-quality images per page across the job, sheets and style round included |
| Style round | 3 directions (2 in clear-first mode), one image each, run at once                     |
| Sheets      | All at once, one try each, one redo for a sheet that fails its gate                   |
| Pages       | One proof per page, then one final; one fresh alternative for a flagged page          |
| Review      | One pass over all pages, one fix round                                                |

Album and Book lanes take the maturing-template caps in [review-and-fix.md](review-and-fix.md) and
add a gate per chapter.

## Start the clock

Write the start time in the brief card and keep a short log: gate, time, elapsed, result. Print the
elapsed time at every gate. Tell the user the expected duration with the estimate.

## Run independent work at once

- The style directions run together.
- All character sheets run together.
- All proofs run together, then all finals, up to the team's concurrency limit. Never review page 1
  while pages 2 to 8 wait to be submitted.
- The reviewers of one pass run together, plus one cold reader for the sequence.
- Check a delegated agent or a background step that has been silent for about ten minutes before
  waiting longer. A crashed one looks the same as a slow one.

## Reviewers

- Write each reviewer's brief and evidence to files before it starts: the page at reading size,
  three or four crops you cut (faces, hands, balloons), the look bible and the questions. The
  reviewer reads only those files.
- A reviewer that explores the project folder took 3 to 6 minutes and about 80 file reads. One with
  an evidence pack took about one minute.
- For 6 to 8 pages: one reviewer for the style round, one per page in the single review pass, and
  two cold reads (the script's words, then the pages). About a dozen runs of about a minute each.

## Gates

Each gate has a pass condition, a time box and a fallback. A gate that fails takes its fallback
once, then the run moves on and logs the gap.

| Gate     | Elapsed | Passes when                                                     | If it fails                                   |
| -------- | ------- | --------------------------------------------------------------- | --------------------------------------------- |
| Brief    | 5 min   | Brief card holds mode, reader, takeaways, lane, pages, estimate | Take the defaults and log them                |
| Script   | 10 min  | Script check and the cover-the-art test pass                    | One rewrite, then go on                       |
| Style    | 15 min  | One direction chosen, anchor page lettering readable at 100%    | Rewrite the direction once, keep the stronger |
| Cast     | 20 min  | Sheets exist, faces differ, costumes read at thumbnail size     | Keep the better sheet and log it              |
| Proofs   | 28 min  | Every page proofed; words exact, cold read follows the proofs   | Fix the words in the prompts once, then go on |
| Finals   | 35 min  | Every page drawn at the top quality from the corrected prompts  | Submit the late pages now, review the rest    |
| Review   | 40 min  | One pass done: defects with crops, taste on the contact sheet   | Skip the taste detail, keep the defects       |
| Fix      | 47 min  | One round done, flagged pages kept or reverted                  | Ship the strongest with a residual list       |
| Delivery | 50 min  | PDF opens, pages read in order, paths and clock log reported    | Never skipped                                 |

Elapsed times fit 6 to 8 pages.

## When a gate runs late

A gate more than a third over its box triggers the cuts, in this order:

1. The stock twin and per-page taste rounds.
2. The alternative try for pages that already read well.
3. Cover, dedication and other extras.
4. The fix round, narrowed to pages the cold read could not follow or that show a wrong character.

Never cut the lettering proofread, the cold read or the reading of the finished PDF.

## Why each cap exists

- A style round of five directions on two pages is ten images and one long wait. Three images on one
  page tell the same story.
- A review round per page in sequence is one round per page of waiting. One pass in parallel gives
  the same findings.
- A fourth try rarely beats the second. When the second fails the same way, the clause is wrong:
  rewrite it ([page-production.md](page-production.md)) instead of drawing again.
- A verdict chase has no end. The cap exits in [review-and-fix.md](review-and-fix.md) end it.
- A proof finds a wrong word, a missing beat or a confusing panel at a fraction of the price of a
  final. A final redrawn for those reasons pays the top price twice.

## Close the log

The final report lists each gate with its elapsed time, the deliverable paths and the known gaps.
