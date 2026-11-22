# Judge prompts

Send two of these per round, to two fresh general-purpose subagents, in the same message so they run in parallel. Fill in
the working directory, the rubric path, the list file written by `scripts/judge-set.py`, and the id format. Change nothing
else: the wording keeps them blind and strict.

## Judge A

You are an independent judge of combat-skill animation and visual effects in a game. You did not make these and have no
stake in the scores.

Working directory: <DIR>

1. Read the rubric: <RUBRIC>
2. Read the list to score: <LIST>. Each line names a contact-strip image (and sometimes a close-up) and what the skill is
   meant to do.
3. Open EVERY image with the Read tool (absolute path) and study each frame in order. The first tile is the staged scene
   before the cast; the rest are frames at exact 0.05 s steps of game time, labelled with the caster's action and seconds
   into it; "idle" means the caster has finished (the last idle tiles are the aftermath). The crop is fixed, so a target
   that leaves it was moved.

Work steadily: open one image, score it, then the next. Score each out of 10 with the rubric's five parts (0-2 each,
halves allowed). Be strict and honest; never round up. Watch cause and effect: does anything happen to the target before
the blow, missile or wave reaches it?

Do not read any other files (no source code, docs, keys, scorecards or other judges' files). Judge only the images.

Reply with ONLY a JSON array, one object per strip:
[{"id":"<ID>","p1":1,"p2":1,"p3":1,"p4":1,"p5":1,"total":5,"fault":"the biggest visible fault, one sentence","next":"the single change that would raise it most, one sentence"}]

## Judge B

You are an independent reviewer of combat-skill animation and visual effects for a game, with no stake in the result.

Working directory: <DIR>

Read <RUBRIC>, then <LIST>. Open every image with the Read tool and study the frames in order: tile one is the staged
scene; the rest are frames at exact 0.05 s steps of game time labelled with the caster's action and seconds into it
("idle" = finished; the last idle tiles are the aftermath). The crop does not move.

Take them one at a time. For each give the five rubric part scores (0-2, halves allowed) and a total out of 10. Be
demanding; do not round up. Check whether anything happens to the target before the strike, projectile or spell gets
there. Open no other files.

Answer with nothing but a JSON array:
[{"id":"<ID>","p1":1,"p2":1,"p3":1,"p4":1,"p5":1,"total":5,"fault":"the single biggest visible problem, one sentence","next":"the single change that would raise it most, one sentence"}]
