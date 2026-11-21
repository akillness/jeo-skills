# Where this skill's taste comes from, and what it does not contain

## The question
The taste in this skill was learned by studying launch films other people made and published. Is it right to turn that into a skill?

## The answer this skill takes
**Learn the way designers learn: by studying published work and writing down principles. Never redistribute the work, and never clone it.**

1. **The films stay private study.** About 50 designer-made launch films (from public social posts and brand channels) and about 30 AI-made films were watched closely by the skill's authors: what was decided, why it works, what fails. They live only in the authors' private study folder. **No frame, clip, audio, logo or screenshot from any of them is part of this skill.**
2. **What ships is principles, in our own words.** `references/judgment.md` describes decisions ("the logo became the product's own control"), not compositions. Examples are described generically (for instance "a launchpad's pill-shaped icon"), so the skill passes on reasoning rather than anyone's look or brand. Ideas and principles are how craft has always been taught: critique, essays and design school, not copying.
3. **The pictures are original.** The calibration strips (`judgment-studies-*.jpg`) are new images generated for this skill with the Codex CLI's built-in image tool, from the prompts in `plates.json` / `plates2.json` (kept in `REF/motion-eye/studies/src/`). Every brand in them is invented. No pair re-creates a specific reference frame. Each pair shows a *judgment*, and the pairs are deliberately drawn in different styles so they don't become a look to copy.
4. **The skill forbids cloning.** It tells the model to derive the look from the subject's own brand, never from a reference, a previous film or the strips.
5. **The user's own material is the user's.** `taste/verdicts.md` records what this user said about films that were made for them.

## Why not a "gold strip" of reference frames?
Two reasons, one ethical and one practical:
- **Redistribution.** Frames cut from other studios' films and shipped inside a tool are their work, not ours.
- **Homogenisation.** An earlier version of this skill used a gold gallery (first real frames, then image-generated re-designs of specific reference frames). Agents copied it. Films for eight different brands came out looking like one designer's reel: a giant cropped word, letters filled with texture, a colour-flood wipe, a dot that becomes the logo. A strip of *looks* teaches a look. A strip of *judgments*, drawn in deliberately different styles, teaches judgment.

## Regenerating
The prompts and the strip builder (`plates.json`, `plates2.json`, `make_strip.py`, raw plates) were kept in the author's working folder and are not part of this repo. Run the prompts through any image model (`scripts/imagegen.py` refuses prompts that ask for text, logos or UI, so any strip prompt with lettering needs a different image tool), name results `<NN>a-default.png` / `<NN>b-decision.png`, run `make_strip.py`. Nothing in this skill depends on regenerating them.
