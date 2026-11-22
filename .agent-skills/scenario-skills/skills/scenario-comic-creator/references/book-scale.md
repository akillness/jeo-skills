# Book scale: hundreds of pages, many sessions

A book fails in three ways. Faces and costumes drift between chapters. Quality is judged by eye
until the reviewer tires. The project dies when a session ends. Files hold the memory.

## Before page 1

1. **Source coverage plan**: every section of the source maps to pages or to "cut" with a reason.
   The user approves it.
2. **Chapter plan**: pages per chapter, silent pages, the landing of each chapter.
3. **Test chapter**: write and run the first four pages of chapter 1 alone. Tune the prompt template
   and the rules, then scale. Tries per final page fall as rules accumulate.
4. **Style and cast**: the style round on the first pages, then every recurring character through
   the cast gate in [style-and-cast.md](style-and-cast.md).
5. **Rights**: adapt a text only when the user owns it or it is in the public domain. The user
   answers for rights to anything else.

## Project files

A fresh agent continues exactly where the last stopped, from these files.

| File                  | Job                                                                           |
| --------------------- | ----------------------------------------------------------------------------- |
| Pointer file          | Short and read first: what the project is, current state, local rules         |
| Rules file            | Rules learned the hard way, each with its date and the failure behind it      |
| History file          | One entry per session, newest first: done, open, which IDs                    |
| Brief card            | The decisions from intake, kept current                                       |
| Page scripts          | One file per page: panel text, what must be visible                           |
| Manifest              | The accepted asset of every page and chapter                                  |
| Attempt ledger        | One row per attempt: page, job, asset, prompt hash, references, cost, outcome |
| Review app (optional) | Pages with their findings, one editable comment per page                      |

Write the ledger row before a paid call and update it after. Count attempts from the ledger, not
from memory.

## Running a chapter

1. Plan the whole chapter first: coverage, exact printable words, panel order, entry and exit state
   of every character.
2. Check each page payload against its scene contract before submitting: time, light, visible cast,
   camera side, object states. A plan on disk is not a constraint the model received.
3. Run in bounded parallel batches (see [page-production.md](page-production.md)).
4. Review every page in three tiers. Redraw only flagged pages.
5. Add accepted pages to the chapter collection and the manifest the same hour.

## Review app

- Findings sit next to the image, editable.
- The user's comment selects a page for redraw. An AI comment never selects one.
- Saved annotations are never overwritten from seed data.
- Unchanged pages carry forward the exact previous asset and show identically on both sides of any
  comparison.

## Labels that stay honest

- Candidate, AI-reviewed, selected for reading and user-approved are four different facts. Keep them
  apart.
- A reading edition built by the agent carries candid findings, not approval.
- Chapter numbering restarts at 1 when the book's does. Keep an internal global index separately.

## Series and aging

A sequel keeps the earlier sheets. When a character ages, make a new state sheet beside the original
and never replace it. Reuse the old style anchor so the books read as one library.

## Session discipline

- Keep sessions short. Write the history entry at the end of each.
- After a compaction, resume from the handoff: the contract, frozen plans, jobs already submitted,
  selected assets, rejected candidates, open defects, remaining attempt budget and the next action.
  Reconcile existing jobs before submitting anything.
- Scope each fix round once and cap attempts per page.
- Do not add sheets mid-book to fix one page. Style drifts everywhere.
