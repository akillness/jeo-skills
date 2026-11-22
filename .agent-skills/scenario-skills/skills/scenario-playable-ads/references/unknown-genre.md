# When the recording is not a genre we know

The genre picker ([genres.md](genres.md)) has 7 families and 27 genres, but a game can be anything.
Work through these steps in order and stop at the first one that settles it.

## 0. Read the user's description

When the user picks **Other** in the genre picker, or the recording is ambiguous, their description
(`intake.json` → `game_description`) comes first: what the player does, what makes it fun, what the
ad should show. Use it to know what to look for in the recording. Where the two disagree, the
recording wins, because the ad must match the real game. Write down the difference in
`analysis/brief.md` and tell the user.

From an idea there is no recording: in steps 1 to 3, read "the recording" as "the brief". The guide
fills what the brief leaves out; with no built guide, start from the nearest **built** one and say
so.

## 1. Classify from the recording, not from the label

Studios name genres loosely ("RPG", "casual", "strategy"). Watch the recording and write down two
things:

| Question                                                                                                                                     | Why it matters                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **What does the finger do most of the time?** Tap, tap-tap, drag, swipe left/right, hold, aim and release, draw a line, or none (a cutscene) | The ad verb. It decides the controls, the hint hand, the QA bot and the nearest guide |
| **What is the most satisfying moment?** (a wipe, a merge, a clear, a reveal, a win)                                                          | The signature payoff. It decides the beat sheet's peak at 10–25 s                     |

The verb narrows it to a family, and the payoff picks the genre inside it. The genre id goes in
`intake.json`.

## 2. Score the match

| Confidence | Means                                                    | Do                                                                                                                                                            |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**   | the verb and the payoff match a **built** row            | follow that guide                                                                                                                                             |
| **Medium** | they match a _nearest_ row, or the game mixes two genres | tell the user which guide you start from and what will differ; for a hybrid, build the genre whose verb the ad uses and note the other in `analysis/brief.md` |
| **Low**    | nothing fits                                             | go to step 3                                                                                                                                                  |

Tell the user the confidence before generating anything. If you are running unattended, pick and say
why in `notes.md`.

## 3. Slice, don't port

Many games are too big for one 35–45 s verb: narrative games, deep strategy, multiplayer, sports
simulations, open worlds. Don't try to recreate the game. Find the **one moment in the recording**
that is a single verb plus a payoff, and build only that:

- a single fight (tap to attack, the boss falls);
- a single choice (pick 1 of 3, see the consequence);
- a single build (place the piece, the building rises);
- a single run (steer, dodge, reach the goal).

The slice must be a real part of the game: the further the ad drifts from the game, the more players
uninstall on day 1.

## 4. If the recording cannot tell you

The recording may show only menus, a cutscene, or a mechanic too fast to read. Then:

- ask the user for a second clip of raw gameplay (a phone screen recording is fine). Unattended,
  stop and report what the recording shows;
- never invent a mechanic the recording does not show. A guessed mechanic is the classic expectation
  mismatch.

From an idea, a brief without what the finger does or the big moment gets one follow-up, in the
genre round. Unattended, stop and report what the brief lacks.

## 5. Build it as a new archetype

When there is no guide, build from the skeleton every playable shares:

| Time    | Beat                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------ |
| 0–2 s   | The waiting screen: the target to touch glows, and the hand shows the gesture (never autoplay)   |
| 2–10 s  | The verb loop: every touch gives instant feedback (sound, burst, number)                         |
| 10–25 s | Escalation to the signature payoff, the biggest and loudest moment                               |
| 25–40 s | The ending: a win for good play, an honest near-fail otherwise, or the time cap                  |
| end     | The end card, with a tease of what comes next (see [make-them-install.md](make-them-install.md)) |

Plan one extra review round. After it passes QA:

- write `references/archetype-<name>.md` with the same sections as the other guides;
- add its row to the archetype index in SKILL.md;
- flip or add its row in `genres.md`.

## Virtual-pad games (◀ ▶ A, a joystick, several buttons)

A phone game with a virtual pad needs two thumbs, and the runtime tracks one pointer (`PA.input`).
Don't rebuild the pad. Collapse it to one finger:

| The game's controls      | One-finger ad verb                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| ◀ ▶ + jump (platformer)  | **tap where to land**: hop toward the tap, aimed to come down on it; a tap in the air is the air or double jump |
| joystick + auto-attack   | tap to move (point-and-go), see the survivor guide                                                              |
| joystick + action button | tap a target to walk there and act on arrival                                                                   |

- The collapsed verb is drift from the real controls. Write it in `analysis/brief.md` and ask the
  user whether the ad must keep the real pad. Unattended, ship the one-finger verb and record the
  drift in `notes.md`.
- Keep everything else real: the jump arcs, air jump, bounce and trail from the recording.

## Landscape games in a portrait ad

The runtime is portrait-first (720 × 1280 logical, letterboxed to 9:16). Don't letterbox a landscape
game into a strip. **Re-slice the level along the portrait axis.**

- A side-scroller becomes a vertical climb: ledges alternate sides, and the camera follows up (see
  [archetype-platformer.md](archetype-platformer.md)).
- A 3D track game is reframed for portrait with a constant horizontal field of view, the vertical
  one derived from the play area (see [archetype-racing.md](archetype-racing.md)).

Use a level shape the recording really shows (a climb, a shaft, a tower), not an invented one.
