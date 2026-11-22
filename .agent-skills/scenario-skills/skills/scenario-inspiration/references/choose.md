# The choice

## Cut many to a few

Never present the search results. Results are material; options are authored. Over-generate first,
then reduce, by one of two rules:

- **Grid.** Name two or three axes (say depiction x palette temperature x detail density), sketch
  the cells, and keep one best candidate per cell. The set spans the space by construction rather
  than by luck.
- **Rerank.** From 20 to 40 candidates, pick one at a time: each next option maximizes fit to the
  brief minus its similarity to the nearest option already picked. Nearest, not average. Averaging
  lets a cluster of near-duplicates survive as long as the set looks spread out overall, and one
  near-duplicate is exactly what should disqualify a candidate.

Select for how different the options **look**, not for how different their parameters were. Four
seeds of one prompt is not an option set, however far apart the seeds are.

## How many

Option count follows the user's state, not a house number.

| Their state                                           | Options       |
| ----------------------------------------------------- | ------------- |
| Deciding between two directions they already hold     | 2             |
| Exploring, no formed preference (the usual case)      | 3 or 4        |
| Asking to see range, with a preference to filter with | 5, on request |

Three to four is a reasoned default, not a measured optimum: it is about as many things as anyone
holds side by side, and too much choice hurts most when preferences are still unformed, which is the
normal state early in a brief. Three concepts is a long-standing industry convention rather than a
finding. Do not claim research settles the number.

## The bar: mutual exclusivity

If picking A does not rule out B, they are not directions, they are one idea in four colors. Test it
by writing what each option gives up. An option that gives up nothing is not on the board.

Every option needs a constituency. Name the kind of brief or audience that would pick it. If you
cannot say who would choose C, C is filler and the set is really three options plus padding.

**No decoys.** Delete any option that is worse than another on every dimension you stated. This
rules out the familiar extravagant / safe / balanced trio, where two concepts exist to be rejected.
If it is not an option you would happily execute, it does not belong in the set.

## Name the axis in the question

Put the axis before the options, not after: "these four vary the lighting, everything else held
constant" beats "here are four options". The named axis is what makes the pick diagnostic and it
teaches the user the vocabulary they will steer with next round.

Vary one named axis per round by default. When a round deliberately spans several axes to find
range, say so and label each option's position on every axis, or the comparison turns into a bag of
unrelated features and the answer stops meaning anything.

Write labels in strict parallel: same shape, same attribute order, roughly the same length, one
differing term. "Warm low-key, tight crop" against "cool low-key, tight crop" is comparable. "Moody"
against "something with more energy and maybe a wider shot" is not, and the difference silently
destroys the information in the reply.

## What each option carries

| Field      | Content                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| Title      | A name someone would repeat in a meeting, not "Option B"                     |
| Intent     | One line: what this direction is doing                                       |
| Position   | Where it sits on the named axis                                              |
| References | Two or three images, one `asset_display` call each, never pasted as raw URLs |
| Wins when  | The brief or audience this is right for                                      |
| Fails when | The condition under which it is wrong, stated as plainly                     |
| Odds       | Safe consensus, or long shot                                                 |

Show all options together in one message rather than one at a time. Marking which are the consensus
and which came off the tail gives a director the axis they actually care about; a relevance ranking
does not. Say it in those words, not as a number, because the estimate behind it is not calibrated.

## Around the options

**Watch the order.** Position drives picks: the ends of a list get attention the middle does not.
Rotate which conceptual pole lands in which slot between rounds, and never let position encode a
recommendation. If you have one, say it in words after the pick, or offer it as a read the user is
free to discount.

**Show the discards.** Two or three lines naming what was cut and why. A set where everything
survived reads as pattern matching on the shape of a good answer; a set with visible abandonments
reads as judgment. This is the cheapest credibility available.

**Always offer a real escape hatch**, phrased as an option rather than a courtesy, and enumerate its
useful forms so it is not a dead end: none of these, a mix of two, the right idea but wrong
execution, or wrong axis entirely.

**"I cannot decide" means the options are too close.** The fix is more spread on the named axis, not
fewer options and not the same question asked again.

## Ask for the pick, then the reason

Ask for the choice first and the reason second, and keep the reason optional. Making someone justify
a preference before forming it distorts the preference, so the order matters: choose, then explain,
and never block on the explanation.

Do not leave the reason as an open field, which asks for structured critique on the spot. Offer the
handles from the axis you varied instead: "was it the light, the palette, the framing, or the
subject?" turns an unanswerable question into a one-word answer that still names the attribute.

When the round matters, ask for a graft instead of a favorite: "which is closest, and what would you
take from one of the others?" A cross-option answer such as "C's lighting on A's composition"
carries far more than a ranking, and it is how directors talk anyway.

## Rounds, not one big list

For a wide-open brief, narrow progressively. Round one settles the axis with the widest visible
spread, round two varies within the branch that survived, round three refines. Say which round this
is and what it decides, so nobody thinks they are approving final art.

After every answer, echo what it settled in the user's own vocabulary: "locked: cool palette, low
key. Still open: framing." A series of picks then accumulates into a brief, and a wrong inference
gets corrected before it compounds.

## When nobody can answer

A non-interactive run still has to choose. Take the pick from the task instructions when they name
one. Otherwise select the option that best satisfies the checkable "hit" line written during prime,
say which one you chose and why in one sentence, mark it provisional, and carry on. Stopping to wait
for an answer that cannot arrive is the worse failure.

## The losers are not waste

Keep them. A rejected direction is a labeled anti-reference, and `search` with
`images: {unlike: [...]}` turns it into an active filter for the rest of the project. Park the near
misses in a short list the user can return to, so a good idea rejected for this brief survives to
the next one.
