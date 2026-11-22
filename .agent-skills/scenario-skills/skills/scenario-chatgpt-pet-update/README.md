# scenario-chatgpt-pet-update: maintainer notes

Not read at runtime. How the skill was built and why it makes its choices.

## The sheet is the identity

The skill has no access to a service-side pet record, so the pet is whatever sheet the user hands
over: a downloaded file, a Codex pet folder, or a Scenario asset. The input is copied, never edited,
and the result is a new package that keeps the original id unless the user renames it (Codex finds a
pet by its folder name).

## Why it shares the create skill's scripts

An update runs the same pipeline as a creation (generate a row, extract it, assemble, check,
preview, package) starting from an existing sheet. Shipping a second copy of the scripts would mean
two copies drifting apart and two test suites; instead the body links the create skill's scripts and
contract by relative path, and the sibling-install sentence covers a missing create skill. The
update-specific pieces live in those scripts: `pet_frames.py split` reads a sheet into rows, an
identity image and row strips; `pet_prepare.py init --from-split` records the original sheet and
builds jobs for only the rows to redo; `pet_build.py` treats the recorded sheet as its base, copying
every row it does not rebuild byte for byte and sizing new rows to the kept idle row.

## Smallest change first

The quick-reference table is ordered by cost. Leftover pixels, color under transparent pixels and a
row whose frames drift are fixed by the build (`--clean`, `--reregister`) without a generation; a
rename touches only `pet.json`; a redone state costs one generation; a new look regenerates
everything because every frame changes, but keeps the old sheet as the base so the pet keeps its
size.

## References for a redone row

The whole sheet is never sent to an image model: at reference resolution it is a grid of small
frames and models copy the grid. `split` writes the idle frame enlarged on a contrasting key
(`identity.png`) and each row as an enlarged strip; a redo job references both, so the new row
matches the pet and its old pose language.
